from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Lesson, Problem, ProblemAttempt, Profile, SubTopic
from ..schemas import ProblemCreate, ProblemUpdate, ProblemOut, AttemptCreate, AttemptOut, SkipCreate, UploadResult
from ..auth import get_current_user, require_admin, require_student
from ..storage import upload_file_bytes
from ..test_parser import parse_test_docx

router = APIRouter(prefix="/problems", tags=["problems"])

MAX_PROBLEMS_PER_LESSON = 10
REGULAR_SCALE = [1, 0, 0, 0, 0]
HARD_SCALE = [1, 0, 0, 0, 0]


def calc_points(is_hard: bool, hints_used: int) -> int:
    scale = HARD_SCALE if is_hard else REGULAR_SCALE
    return scale[min(hints_used, 4)]


def _parse_open_answer(raw: str) -> list[float]:
    """Parse a student's open-answer string into a list of numbers."""
    parts = [p.strip().replace(',', '.') for p in raw.replace(';', ',').split(',') if p.strip()]
    result = []
    for p in parts:
        try:
            result.append(float(p))
        except ValueError:
            pass
    return result


def _normalise_answer(s: str) -> str:
    return s.strip().rstrip('.').lower().replace(';', ',').replace(' ', '')


def _check_open_correct(problem: Problem, raw: str) -> bool:
    if not raw:
        return False
    ans = problem.open_answer
    if ans:
        if ans.get("type") == "single":
            try:
                given = float(raw.strip().replace(',', '.'))
                return abs(given - float(ans.get("value", 0))) < 1e-9
            except ValueError:
                pass
        elif ans.get("type") == "set":
            given = _parse_open_answer(raw)
            expected_set = set(float(v) for v in ans.get("values", []))
            if set(given) == expected_set:
                return True
    # Fallback: normalised text comparison against the stored answer_text
    if problem.answer_text:
        return _normalise_answer(raw) == _normalise_answer(problem.answer_text)
    return False


def _check_mcq_correct(problem: Problem, selected: list[int]) -> bool:
    correct = problem.correct_options or [problem.correct_option]
    return sorted(selected) == sorted(correct)


@router.post("/admin/upload/preview")
async def preview_upload(file: UploadFile = File(...), _=Depends(require_admin)):
    """Parse a .docx and return what would be imported — no DB writes."""
    if not (file.filename or '').lower().endswith('.docx'):
        raise HTTPException(400, "Only .docx files are supported")
    content = await file.read()
    parsed, errors = parse_test_docx(content)
    return {
        'would_import': len(parsed),
        'problems': [
            {
                'level': p['level'],
                'number': p['number'],
                'question': p['question'][:120],
                'answer_type': p['answer_type'],
                'answer': p['answer'],
            }
            for p in parsed
        ],
        'needs_review': [{'number': e['number'], 'issues': e['issues']} for e in errors],
    }


_IMG_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/gif': '.gif', 'image/webp': '.webp',
}


@router.post("/admin/upload", response_model=UploadResult)
async def bulk_upload(
    file: UploadFile = File(...),
    subtopic_id: UUID = Form(...),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Upload a .docx test file and create one lesson per Уровень section.

    If no Уровень headers are found all problems go into a single lesson
    named after the uploaded file.
    """
    if not (file.filename or '').lower().endswith('.docx'):
        raise HTTPException(400, "Only .docx files are supported")

    sub = db.query(SubTopic).filter(SubTopic.id == subtopic_id).first()
    if not sub:
        raise HTTPException(404, "Subtopic not found")

    content = await file.read()
    auto_publish = sub.is_published

    source_url = upload_file_bytes(
        content,
        file.filename or 'problems.docx',
        folder='problem-uploads/',
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    parsed, errors = parse_test_docx(content)

    raw_name = file.filename or 'test.docx'
    file_title = raw_name[:-5] if raw_name.lower().endswith('.docx') else raw_name

    base_idx = db.query(Lesson).filter(Lesson.subtopic_id == subtopic_id).count()

    # All problems from this file go into ONE lesson so that level A/B/C tabs
    # appear together in the student test view rather than as separate cards.
    lesson = Lesson(
        subtopic_id=subtopic_id,
        title=file_title,
        explanation='',
        content_blocks=[],
        order_index=base_idx,
        is_draft=False,
        is_published=auto_publish,
    )
    db.add(lesson)
    db.flush()

    total_imported = 0
    for j, p in enumerate(parsed):
        image_url = None
        for img_bytes, ctype in p.get('images', []):
            ext = _IMG_EXT.get(ctype, '.png')
            image_url = upload_file_bytes(
                img_bytes, f'prob_img{ext}',
                folder='problem-images/', content_type=ctype,
            )
            break  # only the first image per problem

        raw_answer = p['answer']
        is_mcq = (raw_answer or {}).get('type') == 'mcq'

        if is_mcq:
            problem_type = 'mcq'
            opts = raw_answer.get('options', [])
            option_texts = [o.get('text', '') for o in opts]
            correct_key  = (raw_answer.get('correct') or 'A').strip().upper()
            correct_idx  = next(
                (k for k, o in enumerate(opts) if o.get('key', '').upper() == correct_key),
                0,
            )
            options         = option_texts
            correct_option  = correct_idx
            correct_options = [correct_idx]
            open_answer     = None
        else:
            problem_type    = 'open'
            options         = []
            correct_option  = 0
            correct_options = []
            open_answer     = raw_answer

        hint_text = p.get('hint') or None

        prob = Problem(
            subsubtopic_id=lesson.id,
            question=p['question'],
            answer_text=p['answer_text'],
            level=p['level'],
            number=p['number'],
            problem_type=problem_type,
            options=options,
            correct_option=correct_option,
            correct_options=correct_options,
            open_answer=open_answer,
            image_url=image_url,
            is_draft=False,
            is_published=auto_publish,
            is_hard=False,
            order_index=j,
            source_file_url=source_url,
            hint1=hint_text,
            hint2=None,
            hint3=None,
        )
        db.add(prob)
        total_imported += 1

    db.commit()

    return UploadResult(
        imported=total_imported,
        auto_published=auto_publish,
        source_file_url=source_url,
        lessons_created=1,
        errors=[{'zadacha': e['number'], 'reason': '; '.join(e['issues'])} for e in errors],
        skipped=[],
    )


@router.get("/lesson/{lesson_id}", response_model=list[ProblemOut])
def list_problems(lesson_id: UUID, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return (
        db.query(Problem)
        .filter(Problem.subsubtopic_id == lesson_id)
        .order_by(Problem.is_hard, Problem.order_index)
        .all()
    )


@router.post("", response_model=ProblemOut)
def create_problem(body: ProblemCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(Problem).filter(Problem.subsubtopic_id == body.subsubtopic_id).count()
    if count >= MAX_PROBLEMS_PER_LESSON:
        raise HTTPException(400, f"Maximum {MAX_PROBLEMS_PER_LESSON} problems per lesson allowed")

    correct_opts = body.correct_options or ([body.correct_option] if body.correct_option is not None else [0])

    lesson = db.query(Lesson).filter(Lesson.id == body.subsubtopic_id).first()
    lesson_language = lesson.language if lesson else "kz"

    problem = Problem(
        subsubtopic_id=body.subsubtopic_id,
        title=body.title or body.question[:60],
        question=body.question,
        problem_type=body.problem_type,
        options=body.options or [],
        correct_option=correct_opts[0] if correct_opts else 0,
        correct_options=correct_opts,
        open_answer=body.open_answer,
        image_url=body.image_url,
        hint1=body.hint1 or "Think carefully.",
        hint2=body.hint2 or "Review the explanation.",
        hint3=body.hint3 or "The answer relates to the key concept.",
        is_hard=body.is_hard,
        is_draft=body.is_draft,
        is_published=False,
        order_index=count,
        level=body.level,
        language=lesson_language,
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


@router.put("/{problem_id}", response_model=ProblemOut)
def update_problem(problem_id: UUID, body: ProblemUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(404, "Problem not found")
    data = body.model_dump(exclude_none=True)
    # keep correct_option in sync with correct_options
    if "correct_options" in data and data["correct_options"]:
        data["correct_option"] = data["correct_options"][0]
    for field, value in data.items():
        setattr(problem, field, value)
    db.commit()
    db.refresh(problem)
    return problem


@router.delete("/{problem_id}")
def delete_problem(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(404)
    db.delete(problem)
    db.commit()
    return {"ok": True}


@router.post("/{problem_id}/publish")
def publish_problem(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(404)
    parent = db.query(Lesson).filter(Lesson.id == problem.subsubtopic_id).first()
    if not parent or parent.is_draft:
        raise HTTPException(400, "Parent lesson must be saved before publishing problem")
    problem.is_published = True
    problem.is_draft = False
    db.commit()
    return {"ok": True}


@router.post("/{problem_id}/unpublish")
def unpublish_problem(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(404)
    problem.is_published = False
    db.commit()
    return {"ok": True}


@router.post("/attempt", response_model=AttemptOut)
def submit_attempt(body: AttemptCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    problem = db.query(Problem).filter(Problem.id == body.problem_id).first()
    if not problem:
        raise HTTPException(404, "Problem not found")

    # Determine correctness
    if problem.problem_type == "open":
        is_correct = _check_open_correct(problem, body.open_answer_given or "")
    else:
        is_correct = _check_mcq_correct(problem, body.selected_options or [])

    # Only award points on first ever correct attempt for this problem
    already_correct = db.query(ProblemAttempt).filter(
        ProblemAttempt.student_id == current_user.id,
        ProblemAttempt.problem_id == body.problem_id,
        ProblemAttempt.is_correct == True,
    ).first()

    pts = 0
    if is_correct and not already_correct:
        pts = calc_points(problem.is_hard, body.hints_used)

    attempt = ProblemAttempt(
        student_id=current_user.id,
        problem_id=body.problem_id,
        is_correct=is_correct,
        hints_used=body.hints_used,
        points_earned=pts,
        selected_options=body.selected_options or [],
        open_answer_given=body.open_answer_given,
    )
    db.add(attempt)

    if pts > 0:
        current_user.points += pts

    db.commit()
    db.refresh(attempt)
    return attempt


@router.post("/skip", response_model=AttemptOut)
def skip_problem(body: SkipCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    """Record that the student explicitly skipped this problem (no answer given,
    no points, but persisted so 'skipped' survives a page reload and counts
    toward level/lesson completion the same way a real attempt does)."""
    problem = db.query(Problem).filter(Problem.id == body.problem_id).first()
    if not problem:
        raise HTTPException(404, "Problem not found")

    attempt = ProblemAttempt(
        student_id=current_user.id,
        problem_id=body.problem_id,
        is_correct=False,
        hints_used=0,
        points_earned=0,
        selected_options=[],
        open_answer_given=None,
        is_skip=True,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.get("/attempts/lesson/{lesson_id}", response_model=list[AttemptOut])
def get_attempts_for_lesson(lesson_id: UUID, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    problem_ids = [p.id for p in db.query(Problem).filter(Problem.subsubtopic_id == lesson_id).all()]
    if not problem_ids:
        return []
    return db.query(ProblemAttempt).filter(
        ProblemAttempt.student_id == current_user.id,
        ProblemAttempt.problem_id.in_(problem_ids),
    ).all()


@router.get("/attempts/best/{lesson_id}", response_model=list[AttemptOut])
def get_best_attempts_for_lesson(lesson_id: UUID, db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    """Return only the best (correct, or latest) attempt per problem."""
    problems = db.query(Problem).filter(Problem.subsubtopic_id == lesson_id).all()
    result = []
    for p in problems:
        correct = db.query(ProblemAttempt).filter(
            ProblemAttempt.student_id == current_user.id,
            ProblemAttempt.problem_id == p.id,
            ProblemAttempt.is_correct == True,
        ).first()
        if correct:
            result.append(correct)
        else:
            latest = db.query(ProblemAttempt).filter(
                ProblemAttempt.student_id == current_user.id,
                ProblemAttempt.problem_id == p.id,
            ).order_by(ProblemAttempt.attempted_at.desc()).first()
            if latest:
                result.append(latest)
    return result
