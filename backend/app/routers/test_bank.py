import random
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DailyExam, Profile, TestBankProblem
from ..schemas import (
    ExamQuestionOut, ExamResultRow, ExamStatusOut, ExamSubmitRequest,
    TestBankProblemCreate, TestBankProblemOut, TestBankProblemUpdate,
)
from ..auth import require_admin, require_student
from ..storage import upload_file_bytes
from ..test_parser import parse_test_docx
from .problems import _check_mcq_correct, _check_open_correct

router = APIRouter(prefix="/test-bank", tags=["test-bank"])

QUESTIONS_PER_EXAM = 30
DURATION_SECONDS = 30 * 60

_IMG_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/gif': '.gif', 'image/webp': '.webp',
}


def _today_utc5() -> date:
    """The current calendar date in UTC+5 (Kazakhstan time) — the exam rolls
    over at 00:00 UTC+5, i.e. 19:00 UTC the previous day."""
    return (datetime.utcnow() + timedelta(hours=5)).date()


def _get_or_create_exam(db: Session, student: Profile, exam_date: date, language: str) -> DailyExam:
    exam = db.query(DailyExam).filter(
        DailyExam.student_id == student.id,
        DailyExam.exam_date == exam_date,
    ).first()
    if exam:
        return exam

    # Never repeat a question (by canonical number) the student has ever seen,
    # in any language, on any past day.
    seen_numbers: set[int] = set()
    for e in db.query(DailyExam).filter(DailyExam.student_id == student.id).all():
        seen_numbers.update(e.question_numbers or [])

    all_numbers = [
        n for (n,) in db.query(TestBankProblem.number)
            .filter(TestBankProblem.language == language, TestBankProblem.is_published == True)
            .distinct()
            .all()
    ]
    available = [n for n in all_numbers if n not in seen_numbers]
    random.shuffle(available)
    chosen = available[:QUESTIONS_PER_EXAM]

    exam = DailyExam(
        student_id=student.id,
        exam_date=exam_date,
        language=language,
        question_numbers=chosen,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def _fetch_problems(db: Session, exam: DailyExam, display_language: str) -> dict[int, TestBankProblem]:
    if not exam.question_numbers:
        return {}
    rows = db.query(TestBankProblem).filter(
        TestBankProblem.language == display_language,
        TestBankProblem.number.in_(exam.question_numbers),
    ).all()
    return {p.number: p for p in rows}


def _status_response(db: Session, exam: DailyExam, display_language: str | None = None) -> ExamStatusOut:
    # question_numbers are the cross-language canonical identity (see
    # rebuild_testbank.py) — the exam's assigned question set never changes,
    # but WHICH language's row we display it in should follow the caller's
    # current request, not exam.language (fixed once at creation/start
    # time). Falls back to exam.language only if no display language was
    # given, so nothing breaks if this is ever called without one.
    lang = display_language or exam.language
    total = len(exam.question_numbers or [])

    if exam.submitted_at:
        problems = _fetch_problems(db, exam, lang)
        results = []
        for n in exam.question_numbers:
            p = problems.get(n)
            ans = (exam.answers or {}).get(str(n), {}) or {}
            res = (exam.results or {}).get(str(n), {}) or {}
            results.append(ExamResultRow(
                number=n,
                question=p.question if p else "",
                problem_type=p.problem_type if p else "mcq",
                given_selected_options=ans.get("selected_options"),
                given_open_answer=ans.get("open_answer_given"),
                is_correct=bool(res.get("is_correct")),
            ))
        return ExamStatusOut(
            status="submitted",
            started_at=exam.started_at,
            duration_seconds=DURATION_SECONDS,
            results=results,
            score=exam.score,
            total=total,
            terminated_early=exam.terminated_early,
        )

    if exam.started_at:
        problems = _fetch_problems(db, exam, lang)
        questions = [
            ExamQuestionOut(
                id=problems[n].id, number=n,
                question=problems[n].question,
                problem_type=problems[n].problem_type,
                options=problems[n].options,
                image_url=problems[n].image_url,
            )
            for n in exam.question_numbers if n in problems
        ]
        return ExamStatusOut(
            status="in_progress",
            started_at=exam.started_at,
            duration_seconds=DURATION_SECONDS,
            questions=questions,
            total=total,
        )

    return ExamStatusOut(status="not_started", duration_seconds=DURATION_SECONDS, total=total)


# ── Student ─────────────────────────────────────────────────────────────────

@router.get("/today", response_model=ExamStatusOut)
def get_today(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    exam = _get_or_create_exam(db, current_user, _today_utc5(), language)
    return _status_response(db, exam, display_language=language)


@router.post("/start", response_model=ExamStatusOut)
def start_exam(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    exam = _get_or_create_exam(db, current_user, _today_utc5(), language)
    if not exam.started_at and not exam.submitted_at:
        exam.started_at = datetime.utcnow()
        db.commit()
        db.refresh(exam)
    return _status_response(db, exam, display_language=language)


@router.post("/submit", response_model=ExamStatusOut)
def submit_exam(body: ExamSubmitRequest, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_student)):
    exam = db.query(DailyExam).filter(
        DailyExam.student_id == current_user.id,
        DailyExam.exam_date == _today_utc5(),
    ).first()
    if not exam:
        raise HTTPException(404, "No exam found for today")
    if exam.submitted_at:
        return _status_response(db, exam, display_language=language)  # idempotent — don't re-grade or re-award points

    # Grading always uses exam.language (what was actually shown when the
    # student picked each answer) — MCQ option order matches 1:1 across the
    # language pair for the same question number, so this is correct
    # regardless of which language was displayed at submit time.
    problems = _fetch_problems(db, exam, exam.language)
    answers_out: dict = {}
    results_out: dict = {}
    score = 0

    for n in exam.question_numbers:
        p = problems.get(n)
        if not p:
            continue
        a = body.answers.get(str(n))
        selected = a.selected_options if a else None
        open_given = a.open_answer_given if a else None
        answers_out[str(n)] = {"selected_options": selected or [], "open_answer_given": open_given}

        if p.problem_type == "open":
            is_correct = _check_open_correct(p, open_given or "") if open_given else False
        else:
            is_correct = _check_mcq_correct(p, selected or []) if selected else False
        results_out[str(n)] = {"is_correct": is_correct}
        if is_correct:
            score += 1

    exam.answers = answers_out
    exam.results = results_out
    exam.score = score
    exam.submitted_at = datetime.utcnow()
    exam.terminated_early = body.terminated
    if score > 0:
        # Atomic SQL-level increment — avoids losing an update when this
        # races with another points-awarding request (see problems.py).
        db.query(Profile).filter(Profile.id == current_user.id).update(
            {"points": Profile.points + score}, synchronize_session=False
        )

    db.commit()
    db.refresh(exam)
    return _status_response(db, exam, display_language=language)


# ── Admin ───────────────────────────────────────────────────────────────────

@router.get("/admin", response_model=list[TestBankProblemOut])
def admin_list(language: str = "kz", db: Session = Depends(get_db), _=Depends(require_admin)):
    return (
        db.query(TestBankProblem)
        .filter(TestBankProblem.language == language)
        .order_by(TestBankProblem.number)
        .all()
    )


@router.post("/admin", response_model=TestBankProblemOut)
def admin_create(body: TestBankProblemCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    correct_opts = body.correct_options or ([body.correct_option] if body.correct_option is not None else [0])
    row = TestBankProblem(
        number=body.number,
        language=body.language,
        question=body.question,
        problem_type=body.problem_type,
        options=body.options or [],
        correct_option=correct_opts[0] if correct_opts else 0,
        correct_options=correct_opts,
        open_answer=body.open_answer,
        image_url=body.image_url,
        is_published=not body.is_draft,
        is_draft=body.is_draft,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/{problem_id}", response_model=TestBankProblemOut)
def admin_update(problem_id: UUID, body: TestBankProblemUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    row = db.query(TestBankProblem).filter(TestBankProblem.id == problem_id).first()
    if not row:
        raise HTTPException(404)
    data = body.model_dump(exclude_none=True)
    if "correct_options" in data and data["correct_options"]:
        data["correct_option"] = data["correct_options"][0]
    for field, value in data.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/{problem_id}")
def admin_delete(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    p = db.query(TestBankProblem).filter(TestBankProblem.id == problem_id).first()
    if not p:
        raise HTTPException(404)
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/admin/{problem_id}/publish")
def admin_publish(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    p = db.query(TestBankProblem).filter(TestBankProblem.id == problem_id).first()
    if not p:
        raise HTTPException(404)
    p.is_published = True
    p.is_draft = False
    db.commit()
    return {"ok": True}


@router.post("/admin/{problem_id}/unpublish")
def admin_unpublish(problem_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    p = db.query(TestBankProblem).filter(TestBankProblem.id == problem_id).first()
    if not p:
        raise HTTPException(404)
    p.is_published = False
    db.commit()
    return {"ok": True}


@router.post("/admin/upload")
async def admin_upload(
    file: UploadFile = File(...),
    language: str = Form("kz"),
    publish: bool = Form(True),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Parse a bracketed-tag .docx (same format as the leveled-test bulk
    upload) and APPEND every parsed question to the bank — never replaces
    existing rows. The docx's own [ЗАДАЧА N] becomes the canonical number."""
    if not (file.filename or '').lower().endswith('.docx'):
        raise HTTPException(400, "Only .docx files are supported")

    content = await file.read()
    source_url = upload_file_bytes(
        content, file.filename or 'testbank.docx',
        folder='test-bank-uploads/',
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    parsed, errors = parse_test_docx(content)

    imported = 0
    for p in parsed:
        image_url = None
        for img_bytes, ctype in p.get('images', []):
            ext = _IMG_EXT.get(ctype, '.png')
            image_url = upload_file_bytes(
                img_bytes, f'testbank_img{ext}',
                folder='test-bank-images/', content_type=ctype,
            )
            break  # only the first image per problem

        raw_answer = p['answer']
        is_mcq = (raw_answer or {}).get('type') == 'mcq'

        if is_mcq:
            problem_type = 'mcq'
            opts = raw_answer.get('options', [])
            option_texts = [o.get('text', '') for o in opts]
            correct_key = (raw_answer.get('correct') or 'A').strip().upper()
            correct_idx = next(
                (k for k, o in enumerate(opts) if o.get('key', '').upper() == correct_key),
                0,
            )
            options = option_texts
            correct_option = correct_idx
            correct_options = [correct_idx]
            open_answer = None
        else:
            problem_type = 'open'
            options = []
            correct_option = 0
            correct_options = []
            open_answer = raw_answer

        db.add(TestBankProblem(
            number=p['number'],
            language=language,
            question=p['question'],
            problem_type=problem_type,
            options=options,
            correct_option=correct_option,
            correct_options=correct_options,
            open_answer=open_answer,
            answer_text=p['answer_text'],
            image_url=image_url,
            is_published=publish,
            is_draft=not publish,
            source_file_url=source_url,
        ))
        imported += 1

    db.commit()
    return {
        "imported": imported,
        "errors": [{"number": e["number"], "reason": "; ".join(e["issues"])} for e in errors],
    }
