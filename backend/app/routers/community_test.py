import random
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CommunityTest, CommunityTestQuestion, CommunityTestAttempt, Profile
from ..schemas import (
    CommunityTestQuestionOut, CommunityTestSubmitRequest, CommunityTestResultRow,
    CommunityTestStatusOut, CommunityTestAttemptSummaryOut,
    CommunityTestOut, CommunityTestSettingsUpdate,
    CommunityTestAdminAttemptRow, CommunityTestAdminAttemptDetailOut, CommunityTestAdminResultRow,
)
from ..auth import require_admin, get_current_user

router = APIRouter(prefix="/community-test", tags=["community-test"])


def require_community_test_access(current_user: Profile = Depends(get_current_user)) -> Profile:
    """Same as require_student, plus the (rare, admin-set) per-student
    opt-out -- same pattern as require_duel_access/require_submission_access."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    if current_user.community_test_disabled:
        raise HTTPException(status_code=403, detail="community_test_disabled")
    return current_user


def _get_active_test(db: Session) -> CommunityTest | None:
    return db.query(CommunityTest).filter(CommunityTest.is_active == True).first()  # noqa: E712


def _questions_by_number(db: Session, test_id: UUID) -> dict[int, CommunityTestQuestion]:
    rows = db.query(CommunityTestQuestion).filter(CommunityTestQuestion.test_id == test_id).all()
    return {q.number: q for q in rows}


def _resolve_question(q: CommunityTestQuestion, language: str) -> tuple[str, list[str]]:
    if language == "ru":
        return q.question_ru, q.options_ru
    return q.question_kz, q.options_kz


def _attempt_number(db: Session, test_id: UUID, student_id: UUID, attempt_id: UUID) -> int:
    """1-based position of this attempt among the student's own SUBMITTED
    attempts for this edition, ordered oldest-first -- derived at read
    time, never stored (same philosophy as Duel's history ordering)."""
    ids = [
        str(a_id) for (a_id,) in
        db.query(CommunityTestAttempt.id)
          .filter(
              CommunityTestAttempt.test_id == test_id,
              CommunityTestAttempt.student_id == student_id,
              CommunityTestAttempt.submitted_at.isnot(None),
          )
          .order_by(CommunityTestAttempt.created_at.asc())
          .all()
    ]
    try:
        return ids.index(str(attempt_id)) + 1
    except ValueError:
        return len(ids) + 1  # not-yet-submitted attempt -- would be the next one


def _attempt_summary(db: Session, attempt: CommunityTestAttempt, test: CommunityTest, language: str) -> CommunityTestAttemptSummaryOut:
    title = test.title_ru if language == "ru" else test.title_kz
    return CommunityTestAttemptSummaryOut(
        id=attempt.id,
        test_id=test.id,
        test_title=title or "",
        attempt_number=_attempt_number(db, test.id, attempt.student_id, attempt.id),
        score=attempt.score,
        total=len(attempt.question_numbers or []),
        submitted_at=attempt.submitted_at,
        terminated_early=attempt.terminated_early,
    )


# ── Student ───────────────────────────────────────────────────────────────────

def _in_progress_attempt(db: Session, student_id: UUID) -> CommunityTestAttempt | None:
    """A student can only ever have ONE in-progress attempt at a time,
    regardless of which edition it belongs to -- so this deliberately
    does NOT filter by test_id. If the admin swaps editions while a
    student is mid-attempt on the old one, they still see and finish
    that same in-progress attempt (against the old edition's own
    questions/time limit) before a new one can start."""
    return (
        db.query(CommunityTestAttempt)
        .filter(CommunityTestAttempt.student_id == student_id, CommunityTestAttempt.submitted_at.is_(None))
        .order_by(CommunityTestAttempt.created_at.desc())
        .first()
    )


@router.get("/status", response_model=CommunityTestStatusOut)
def get_status(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_community_test_access)):
    in_progress = _in_progress_attempt(db, current_user.id)

    if in_progress:
        test = db.query(CommunityTest).filter(CommunityTest.id == in_progress.test_id).first()
        if not test:
            raise HTTPException(500, "Attempt references a missing test")
        completed = (
            db.query(CommunityTestAttempt)
            .filter(
                CommunityTestAttempt.test_id == test.id,
                CommunityTestAttempt.student_id == current_user.id,
                CommunityTestAttempt.submitted_at.isnot(None),
            )
            .order_by(CommunityTestAttempt.created_at.desc())
            .all()
        )
        last_attempt = _attempt_summary(db, completed[0], test, language) if completed else None
        title = test.title_ru if language == "ru" else test.title_kz
        description = test.description_ru if language == "ru" else test.description_kz

        problems = _questions_by_number(db, test.id)
        questions = []
        for n in in_progress.question_numbers:
            q = problems.get(n)
            if not q:
                continue
            text, options = _resolve_question(q, language)
            questions.append(CommunityTestQuestionOut(number=n, question=text, options=options))

        return CommunityTestStatusOut(
            status="in_progress", test_id=test.id, title=title, description=description,
            time_limit_minutes=test.time_limit_minutes, attempts_count=len(completed),
            last_attempt=last_attempt, started_at=in_progress.started_at, questions=questions,
        )

    test = _get_active_test(db)
    if not test:
        return CommunityTestStatusOut(status="no_active_test")

    completed = (
        db.query(CommunityTestAttempt)
        .filter(
            CommunityTestAttempt.test_id == test.id,
            CommunityTestAttempt.student_id == current_user.id,
            CommunityTestAttempt.submitted_at.isnot(None),
        )
        .order_by(CommunityTestAttempt.created_at.desc())
        .all()
    )
    last_attempt = _attempt_summary(db, completed[0], test, language) if completed else None
    title = test.title_ru if language == "ru" else test.title_kz
    description = test.description_ru if language == "ru" else test.description_kz

    return CommunityTestStatusOut(
        status="not_started", test_id=test.id, title=title, description=description,
        time_limit_minutes=test.time_limit_minutes, attempts_count=len(completed), last_attempt=last_attempt,
    )


@router.post("/start", response_model=CommunityTestStatusOut)
def start_attempt(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_community_test_access)):
    existing = _in_progress_attempt(db, current_user.id)
    if not existing:
        test = _get_active_test(db)
        if not test:
            raise HTTPException(404, "No active community test")
        numbers = list(_questions_by_number(db, test.id).keys())
        random.shuffle(numbers)
        existing = CommunityTestAttempt(
            test_id=test.id, student_id=current_user.id, language=language,
            question_numbers=numbers, started_at=datetime.utcnow(),
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)

    return get_status(language=language, db=db, current_user=current_user)


@router.post("/submit", response_model=CommunityTestStatusOut)
def submit_attempt(
    body: CommunityTestSubmitRequest, language: str = "kz",
    db: Session = Depends(get_db), current_user: Profile = Depends(require_community_test_access),
):
    attempt = _in_progress_attempt(db, current_user.id)
    if not attempt:
        raise HTTPException(404, "No in-progress attempt found")

    test = db.query(CommunityTest).filter(CommunityTest.id == attempt.test_id).first()
    problems = _questions_by_number(db, attempt.test_id)

    answers_out: dict = {}
    results_out: dict = {}
    score = 0
    for n in attempt.question_numbers:
        q = problems.get(n)
        if not q:
            continue
        a = body.answers.get(str(n))
        selected = a.selected_option if a else None
        answers_out[str(n)] = {"selected_option": selected}
        is_correct = selected is not None and selected == q.correct_option
        results_out[str(n)] = {"is_correct": is_correct}
        if is_correct:
            score += 1

    # Server-side deadline enforcement -- the client's `terminated` flag is
    # an anti-cheat UX signal, not authoritative; a late submit is still
    # graded and saved (never drop a slow-network submission), but gets
    # forced into terminated_early regardless of what the client claims.
    deadline = attempt.started_at + timedelta(minutes=test.time_limit_minutes) if (attempt.started_at and test) else None
    overdue = bool(deadline and datetime.utcnow() > deadline)

    attempt.answers = answers_out
    attempt.results = results_out
    attempt.score = score
    attempt.submitted_at = datetime.utcnow()
    attempt.terminated_early = body.terminated or overdue
    db.commit()
    db.refresh(attempt)

    return _submitted_response(db, attempt, test, language)


@router.get("/attempts", response_model=list[CommunityTestAttemptSummaryOut])
def list_my_attempts(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_community_test_access)):
    attempts = (
        db.query(CommunityTestAttempt)
        .filter(CommunityTestAttempt.student_id == current_user.id, CommunityTestAttempt.submitted_at.isnot(None))
        .order_by(CommunityTestAttempt.created_at.desc())
        .all()
    )
    tests = {t.id: t for t in db.query(CommunityTest).all()}
    return [
        _attempt_summary(db, a, tests[a.test_id], language)
        for a in attempts if a.test_id in tests
    ]


def _submitted_response(db: Session, attempt: CommunityTestAttempt, test: CommunityTest | None, language: str) -> CommunityTestStatusOut:
    """The full per-question review of ONE just-submitted (or previously
    submitted) attempt -- status='submitted' here is transient, specific
    to this one attempt, and never what GET /status should show on a
    later poll (that always resolves to 'not_started'/'in_progress' for
    whatever attempt is current, per the unlimited-attempts model)."""
    problems = _questions_by_number(db, attempt.test_id)
    results = []
    for n in attempt.question_numbers:
        q = problems.get(n)
        if not q:
            continue
        text, _ = _resolve_question(q, language)
        ans = (attempt.answers or {}).get(str(n), {}) or {}
        res = (attempt.results or {}).get(str(n), {}) or {}
        results.append(CommunityTestResultRow(
            number=n, question=text,
            given_selected_option=ans.get("selected_option"),
            is_correct=bool(res.get("is_correct")),
        ))

    title = (test.title_ru if language == "ru" else test.title_kz) if test else None
    return CommunityTestStatusOut(
        status="submitted", test_id=attempt.test_id, title=title,
        results=results, score=attempt.score, total=len(attempt.question_numbers or []),
        terminated_early=attempt.terminated_early,
    )


@router.get("/attempts/{attempt_id}", response_model=CommunityTestStatusOut)
def get_my_attempt_detail(attempt_id: UUID, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_community_test_access)):
    attempt = db.query(CommunityTestAttempt).filter(CommunityTestAttempt.id == attempt_id).first()
    if not attempt or attempt.student_id != current_user.id:
        raise HTTPException(404, "Attempt not found")
    if not attempt.submitted_at:
        raise HTTPException(400, "Attempt not yet submitted")

    test = db.query(CommunityTest).filter(CommunityTest.id == attempt.test_id).first()
    return _submitted_response(db, attempt, test, language)


# ── Admin ─────────────────────────────────────────────────────────────────────

@router.get("/admin/tests", response_model=list[CommunityTestOut])
def admin_list_tests(db: Session = Depends(get_db), _=Depends(require_admin)):
    tests = db.query(CommunityTest).order_by(CommunityTest.created_at.desc()).all()
    out = []
    for t in tests:
        qcount = db.query(CommunityTestQuestion).filter(CommunityTestQuestion.test_id == t.id).count()
        acount = db.query(CommunityTestAttempt).filter(
            CommunityTestAttempt.test_id == t.id, CommunityTestAttempt.submitted_at.isnot(None)
        ).count()
        out.append(CommunityTestOut(
            id=t.id, title_kz=t.title_kz, title_ru=t.title_ru,
            description_kz=t.description_kz, description_ru=t.description_ru,
            time_limit_minutes=t.time_limit_minutes, is_active=t.is_active,
            created_at=t.created_at, activated_at=t.activated_at, closed_at=t.closed_at,
            question_count=qcount, attempt_count=acount,
        ))
    return out


@router.post("/admin/tests/{test_id}/settings", response_model=CommunityTestOut)
def admin_update_settings(test_id: UUID, body: CommunityTestSettingsUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.query(CommunityTest).filter(CommunityTest.id == test_id).first()
    if not t:
        raise HTTPException(404)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    qcount = db.query(CommunityTestQuestion).filter(CommunityTestQuestion.test_id == t.id).count()
    acount = db.query(CommunityTestAttempt).filter(
        CommunityTestAttempt.test_id == t.id, CommunityTestAttempt.submitted_at.isnot(None)
    ).count()
    return CommunityTestOut(
        id=t.id, title_kz=t.title_kz, title_ru=t.title_ru,
        description_kz=t.description_kz, description_ru=t.description_ru,
        time_limit_minutes=t.time_limit_minutes, is_active=t.is_active,
        created_at=t.created_at, activated_at=t.activated_at, closed_at=t.closed_at,
        question_count=qcount, attempt_count=acount,
    )


@router.post("/admin/tests/{test_id}/deactivate")
def admin_deactivate(test_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.query(CommunityTest).filter(CommunityTest.id == test_id).first()
    if not t:
        raise HTTPException(404)
    t.is_active = False
    t.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/admin/attempts", response_model=list[CommunityTestAdminAttemptRow])
def admin_list_attempts(
    test_id: UUID | None = None, student_id: UUID | None = None,
    db: Session = Depends(get_db), _=Depends(require_admin),
):
    q = db.query(CommunityTestAttempt).filter(CommunityTestAttempt.submitted_at.isnot(None))
    if test_id:
        q = q.filter(CommunityTestAttempt.test_id == test_id)
    if student_id:
        q = q.filter(CommunityTestAttempt.student_id == student_id)
    attempts = q.order_by(CommunityTestAttempt.created_at.desc()).all()

    tests = {t.id: t for t in db.query(CommunityTest).all()}
    students = {s.id: s for s in db.query(Profile).all()}

    rows = []
    for a in attempts:
        t = tests.get(a.test_id)
        s = students.get(a.student_id)
        if not t or not s:
            continue
        rows.append(CommunityTestAdminAttemptRow(
            id=a.id, test_id=t.id, test_title=t.title_kz or t.title_ru or "",
            student_id=s.id, student_name=s.name, student_surname=s.surname,
            attempt_number=_attempt_number(db, t.id, s.id, a.id),
            score=a.score, total=len(a.question_numbers or []),
            started_at=a.started_at, submitted_at=a.submitted_at,
            terminated_early=a.terminated_early,
        ))
    return rows


@router.get("/admin/attempts/{attempt_id}", response_model=CommunityTestAdminAttemptDetailOut)
def admin_attempt_detail(attempt_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    a = db.query(CommunityTestAttempt).filter(CommunityTestAttempt.id == attempt_id).first()
    if not a:
        raise HTTPException(404)
    t = db.query(CommunityTest).filter(CommunityTest.id == a.test_id).first()
    s = db.query(Profile).filter(Profile.id == a.student_id).first()
    if not t or not s:
        raise HTTPException(404)

    problems = _questions_by_number(db, a.test_id)
    results = []
    for n in a.question_numbers:
        q = problems.get(n)
        if not q:
            continue
        ans = (a.answers or {}).get(str(n), {}) or {}
        res = (a.results or {}).get(str(n), {}) or {}
        results.append(CommunityTestAdminResultRow(
            number=n, question=q.question_kz, options=q.options_kz,
            given_selected_option=ans.get("selected_option"),
            correct_option=q.correct_option,
            is_correct=bool(res.get("is_correct")),
        ))

    return CommunityTestAdminAttemptDetailOut(
        id=a.id, test_title=t.title_kz or t.title_ru or "",
        student_name=s.name, student_surname=s.surname,
        attempt_number=_attempt_number(db, t.id, s.id, a.id),
        score=a.score, total=len(a.question_numbers or []),
        started_at=a.started_at, submitted_at=a.submitted_at,
        terminated_early=a.terminated_early, results=results,
    )
