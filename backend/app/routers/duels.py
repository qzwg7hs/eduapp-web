# -*- coding: utf-8 -*-
"""
Asynchronous 1v1 duels over a small shared set of Test Bank questions.
See models.Duel for the full lifecycle/field reasoning. Student-facing
only — content is drawn from the existing admin-managed Test Bank pool,
no separate duel-content authoring is needed.
"""
import random
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Duel, Profile, TestBankProblem
from ..schemas import (
    DuelChallengeCreate, DuelDetailOut, DuelListItemOut, DuelOpponentOut,
    ExamQuestionOut, ExamResultRow, ExamSubmitRequest,
)
from ..auth import require_student
from ..scoring import award_monthly_points
from .problems import _check_mcq_correct, _check_open_correct

router = APIRouter(prefix="/duels", tags=["duels"])

QUESTIONS_PER_DUEL = 6
DURATION_SECONDS = 6 * 60      # 1 min/question, same ratio as the 30q/30min daily test
EXPIRY_HOURS = 24
POINTS_PER_CORRECT = 2         # deliberately above the daily test's 1-per-correct rate — a duel is a
                                # riskier, more effortful format (real opponent, tight 6-minute clock)
WINNER_BONUS = 20              # a clean win now nets up to 12 (base) + 20 = 32 — noticeably more than
                                # a weekly mission's ~20, which is intentional: winning a duel is meant
                                # to feel like a bigger deal than a passive weekly goal


def require_duel_access(current_user: Profile = Depends(require_student)) -> Profile:
    """Same as require_student, plus the (rare, admin-set) per-student
    opt-out — a student with duel_disabled can't use ANY duel endpoint,
    as either challenger or opponent. Distinct from is_decorative, which
    only ever affects whether OTHER students can select someone as an
    opponent — it never blocks the flagged account from acting itself
    (needed so the 20 seeded leaderboard accounts, which can't log in
    anyway, and any test accounts, which DO need to duel each other while
    testing, both stay is_decorative without losing their own ability to
    act where that's actually wanted)."""
    if current_user.duel_disabled:
        raise HTTPException(403, "duel_access_disabled")
    return current_user


def _today_utc5() -> date:
    return (datetime.utcnow() + timedelta(hours=5)).date()


def _utc5_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, datetime.min.time()) - timedelta(hours=5)
    return start, start + timedelta(days=1)


def _has_outstanding_sent_challenge(db: Session, student_id) -> bool:
    """An unanswered challenge this student sent, still waiting on the
    opponent's accept/decline. A pending challenge sitting unanswered
    blocks sending another one — until the opponent declines it (or it
    expires), at which point it stops being 'pending' and this naturally
    unblocks. Nothing here counts against the real daily cap — only an
    ACCEPTED duel does (see _has_active_duel/_completed_today below)."""
    pending = db.query(Duel).filter(Duel.challenger_id == student_id, Duel.status == "pending").all()
    _expire_overdue_bulk(db, pending)
    return any(d.status == "pending" for d in pending)


def _has_active_duel(db: Session, student_id) -> bool:
    """A duel that's been accepted and is still being played out (either
    side hasn't submitted yet) — in either role. Blocks starting or
    accepting another until this one resolves, regardless of which
    calendar day it was originally accepted on."""
    active = db.query(Duel).filter(
        or_(Duel.challenger_id == student_id, Duel.opponent_id == student_id), Duel.status == "active",
    ).all()
    _expire_overdue_bulk(db, active)
    return any(d.status == "active" for d in active)


def _completed_today(db: Session, student_id, today: date) -> bool:
    """Already had a duel resolve today (in either role) — the actual
    'one duel per day' cap. Only an ACCEPTED-then-completed duel ever
    counts here; a pending challenge that was declined, expired, or never
    answered doesn't touch this at all (see the four rules this
    implements, from the conversation this was specified in)."""
    start, end = _utc5_day_bounds_utc(today)
    row = db.query(Duel.id).filter(
        or_(Duel.challenger_id == student_id, Duel.opponent_id == student_id),
        Duel.status == "completed", Duel.accepted_at >= start, Duel.accepted_at < end,
    ).first()
    return row is not None


def _blocked_from_new_duel(db: Session, student_id) -> bool:
    """The real daily-cap check for accept()/challenge(): true once this
    student has an in-progress or already-resolved (today) duel — declining
    or being declined never triggers this."""
    return _has_active_duel(db, student_id) or _completed_today(db, student_id, _today_utc5())


def _expire_if_overdue(db: Session, duel: Duel) -> Duel:
    if duel.status in ("pending", "active") and datetime.utcnow() > duel.created_at + timedelta(hours=EXPIRY_HOURS):
        duel.status = "expired"
        db.commit()
        db.refresh(duel)
    return duel


def _expire_overdue_bulk(db: Session, duels: list[Duel]) -> None:
    now = datetime.utcnow()
    changed = False
    for d in duels:
        if d.status in ("pending", "active") and now > d.created_at + timedelta(hours=EXPIRY_HOURS):
            d.status = "expired"
            changed = True
    if changed:
        db.commit()


def _fetch_duel_problems(db: Session, duel: Duel, display_language: str) -> dict[int, TestBankProblem]:
    if not duel.question_numbers:
        return {}
    rows = db.query(TestBankProblem).filter(
        TestBankProblem.language == display_language,
        TestBankProblem.number.in_(duel.question_numbers),
    ).all()
    return {p.number: p for p in rows}


def _finalize_if_both_done(db: Session, duel: Duel) -> None:
    """Only acts once BOTH sides have submitted — request-triggered by
    whichever submit call finishes second, never time-based (only expiry
    needs lazy read-time evaluation)."""
    if duel.status != "active" or not (duel.challenger_submitted_at and duel.opponent_submitted_at):
        return

    duel.status = "completed"
    if duel.challenger_score > duel.opponent_score:
        duel.winner_id = duel.challenger_id
    elif duel.opponent_score > duel.challenger_score:
        duel.winner_id = duel.opponent_id
    else:
        duel.winner_id = None  # tie — no bonus either side, both keep their per-correct points

    challenger_pts = duel.challenger_score * POINTS_PER_CORRECT + (WINNER_BONUS if duel.winner_id == duel.challenger_id else 0)
    opponent_pts = duel.opponent_score * POINTS_PER_CORRECT + (WINNER_BONUS if duel.winner_id == duel.opponent_id else 0)
    duel.challenger_points_awarded = challenger_pts
    duel.opponent_points_awarded = opponent_pts
    duel.points_awarded = True

    if challenger_pts > 0:
        db.query(Profile).filter(Profile.id == duel.challenger_id).update(
            {"points": Profile.points + challenger_pts}, synchronize_session=False
        )
        award_monthly_points(db, duel.challenger_id, challenger_pts)
    if opponent_pts > 0:
        db.query(Profile).filter(Profile.id == duel.opponent_id).update(
            {"points": Profile.points + opponent_pts}, synchronize_session=False
        )
        award_monthly_points(db, duel.opponent_id, opponent_pts)

    db.commit()
    db.refresh(duel)


def _build_results(duel: Duel, results_raw: dict, answers_raw: dict, problems: dict[int, TestBankProblem]) -> list[ExamResultRow]:
    out = []
    for n in duel.question_numbers or []:
        p = problems.get(n)
        ans = (answers_raw or {}).get(str(n), {}) or {}
        res = (results_raw or {}).get(str(n), {}) or {}
        out.append(ExamResultRow(
            number=n, question=p.question if p else "", problem_type=p.problem_type if p else "mcq",
            given_selected_options=ans.get("selected_options"), given_open_answer=ans.get("open_answer_given"),
            is_correct=bool(res.get("is_correct")),
        ))
    return out


def _to_detail(db: Session, duel: Duel, viewer_id, language: str, include_content: bool = True) -> DuelDetailOut:
    """Resolves 'my side' vs 'opponent's side' from the flat challenger_*/
    opponent_* columns based on who's asking. Opponent's results/score are
    only ever revealed once status == 'completed' — no live peeking at an
    in-progress opponent."""
    am_challenger = duel.challenger_id == viewer_id
    my_id = duel.challenger_id if am_challenger else duel.opponent_id
    opp_id = duel.opponent_id if am_challenger else duel.challenger_id
    my_started = duel.challenger_started_at if am_challenger else duel.opponent_started_at
    my_submitted = duel.challenger_submitted_at if am_challenger else duel.opponent_submitted_at
    opp_submitted = duel.opponent_submitted_at if am_challenger else duel.challenger_submitted_at
    my_score = duel.challenger_score if am_challenger else duel.opponent_score
    opp_score = duel.opponent_score if am_challenger else duel.challenger_score
    my_answers = duel.challenger_answers if am_challenger else duel.opponent_answers
    opp_answers = duel.opponent_answers if am_challenger else duel.challenger_answers
    my_results_raw = duel.challenger_results if am_challenger else duel.opponent_results
    opp_results_raw = duel.opponent_results if am_challenger else duel.challenger_results
    my_pts = duel.challenger_points_awarded if am_challenger else duel.opponent_points_awarded
    opp_pts = duel.opponent_points_awarded if am_challenger else duel.challenger_points_awarded

    other = db.query(Profile).filter(Profile.id == opp_id).first()
    my_state = "submitted" if my_submitted else ("in_progress" if my_started else "not_started")

    questions = None
    my_results = None
    opponent_results = None
    if include_content and (my_state != "not_started" or duel.status == "completed"):
        problems = _fetch_duel_problems(db, duel, language)
        if my_state == "in_progress":
            questions = [
                ExamQuestionOut(id=problems[n].id, number=n, question=problems[n].question,
                                 problem_type=problems[n].problem_type, options=problems[n].options,
                                 image_url=problems[n].image_url)
                for n in (duel.question_numbers or []) if n in problems
            ]
        if my_state == "submitted":
            my_results = _build_results(duel, my_results_raw, my_answers, problems)
        if duel.status == "completed":  # only reveal the other side once BOTH are done
            opponent_results = _build_results(duel, opp_results_raw, opp_answers, problems)

    winner = None
    if duel.status == "completed":
        winner = "tie" if duel.winner_id is None else ("me" if duel.winner_id == my_id else "opponent")

    return DuelDetailOut(
        id=duel.id, role="challenger" if am_challenger else "opponent",
        opponent=DuelOpponentOut.model_validate(other), status=duel.status,
        created_at=duel.created_at, expires_at=duel.created_at + timedelta(hours=EXPIRY_HOURS),
        my_submitted=bool(my_submitted), opponent_submitted=bool(opp_submitted),
        my_score=my_score if my_state == "submitted" else None,
        opponent_score=opp_score if duel.status == "completed" else None,
        winner=winner, my_points_earned=my_pts if duel.points_awarded else None,
        opponent_points_earned=opp_pts if duel.points_awarded else None,
        duration_seconds=DURATION_SECONDS, total=len(duel.question_numbers or []),
        my_state=my_state, my_started_at=my_started, questions=questions,
        my_results=my_results, opponent_results=opponent_results,
    )


def _to_list_item(db: Session, duel: Duel, viewer_id) -> DuelListItemOut:
    # language is irrelevant here since include_content=False skips every
    # field that would depend on it (questions/results text).
    detail = _to_detail(db, duel, viewer_id, language="kz", include_content=False)
    return DuelListItemOut(**{k: v for k, v in detail.model_dump().items() if k in DuelListItemOut.model_fields})


def _get_owned_duel(db: Session, duel_id: UUID, viewer_id) -> Duel:
    duel = db.query(Duel).filter(
        Duel.id == duel_id, or_(Duel.challenger_id == viewer_id, Duel.opponent_id == viewer_id),
    ).first()
    if not duel:
        raise HTTPException(404, "Duel not found")
    return duel


@router.get("/opponents", response_model=list[DuelOpponentOut])
def list_opponents(q: str = "", db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    query = db.query(Profile).filter(
        Profile.role == "student", Profile.is_active == True, Profile.id != current_user.id,
    )
    # A real (non-decorative) student never sees decorative accounts (fake
    # leaderboard fillers, test/QA accounts, etc). A decorative account's
    # OWN search skips this filter — needed so e.g. two test accounts can
    # still find and duel each other while testing, without also being
    # selectable by real students.
    if not current_user.is_decorative:
        query = query.filter(Profile.is_decorative == False)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Profile.name.ilike(like), Profile.surname.ilike(like), Profile.unique_id.ilike(like)))
    return query.order_by(Profile.surname).limit(30).all()


@router.get("/can-challenge")
def can_challenge(db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    """Lets the frontend disable the 'Challenge someone' button pre-emptively
    with the right reason, instead of only finding out after a failed POST."""
    if _has_outstanding_sent_challenge(db, current_user.id):
        return {"blocked": True, "reason": "pending"}
    if _blocked_from_new_duel(db, current_user.id):
        return {"blocked": True, "reason": "daily_cap"}
    return {"blocked": False, "reason": None}


@router.get("/pending-count")
def pending_count(db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    """Things needing my action right now: incoming challenges awaiting my
    accept/decline, plus active duels I haven't submitted yet."""
    incoming = db.query(Duel).filter(Duel.opponent_id == current_user.id, Duel.status == "pending").all()
    active_mine = db.query(Duel).filter(
        or_(Duel.challenger_id == current_user.id, Duel.opponent_id == current_user.id), Duel.status == "active",
    ).all()
    _expire_overdue_bulk(db, incoming + active_mine)

    count = sum(1 for d in incoming if d.status == "pending")
    for d in active_mine:
        if d.status != "active":
            continue
        am_challenger = d.challenger_id == current_user.id
        submitted = d.challenger_submitted_at if am_challenger else d.opponent_submitted_at
        if not submitted:
            count += 1
    return {"count": count}


@router.get("/mine", response_model=list[DuelListItemOut])
def list_mine(db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duels = db.query(Duel).filter(
        or_(Duel.challenger_id == current_user.id, Duel.opponent_id == current_user.id),
    ).order_by(Duel.created_at.desc()).all()
    _expire_overdue_bulk(db, duels)
    return [_to_list_item(db, d, current_user.id) for d in duels]


@router.get("/{duel_id}", response_model=DuelDetailOut)
def get_duel(duel_id: UUID, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duel = _get_owned_duel(db, duel_id, current_user.id)
    duel = _expire_if_overdue(db, duel)
    return _to_detail(db, duel, current_user.id, language)


@router.post("/challenge", response_model=DuelListItemOut)
def challenge(body: DuelChallengeCreate, db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    if body.opponent_id == current_user.id:
        raise HTTPException(400, "duel_opponent_invalid")
    opponent = db.query(Profile).filter(Profile.id == body.opponent_id).first()
    if not opponent:
        raise HTTPException(404, "duel_opponent_not_found")
    if opponent.role != "student" or not opponent.is_active:
        raise HTTPException(400, "duel_opponent_invalid")
    # Same asymmetric rule as list_opponents: a real student can never
    # target a decorative account, but a decorative account (e.g. a test
    # account) can still target another one directly.
    if opponent.is_decorative and not current_user.is_decorative:
        raise HTTPException(400, "duel_opponent_invalid")
    if _has_outstanding_sent_challenge(db, current_user.id):
        raise HTTPException(400, "duel_pending_challenge_exists")
    if _blocked_from_new_duel(db, current_user.id):
        raise HTTPException(400, "duel_daily_cap_reached")

    duel = Duel(challenger_id=current_user.id, opponent_id=opponent.id, status="pending", created_at=datetime.utcnow())
    db.add(duel)
    db.commit()
    db.refresh(duel)
    return _to_list_item(db, duel, current_user.id)


@router.post("/{duel_id}/accept", response_model=DuelDetailOut)
def accept(duel_id: UUID, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duel = db.query(Duel).filter(Duel.id == duel_id, Duel.opponent_id == current_user.id).first()
    if not duel:
        raise HTTPException(404, "Duel not found")
    duel = _expire_if_overdue(db, duel)
    if duel.status != "pending":
        return _to_detail(db, duel, current_user.id, language)  # idempotent — already moved on
    if _blocked_from_new_duel(db, current_user.id):
        raise HTTPException(400, "duel_daily_cap_reached")

    all_numbers = [
        n for (n,) in db.query(TestBankProblem.number)
            .filter(TestBankProblem.language == language, TestBankProblem.is_published == True)
            .distinct().all()
    ]
    random.shuffle(all_numbers)
    duel.question_numbers = all_numbers[:QUESTIONS_PER_DUEL]
    duel.language = language
    duel.status = "active"
    duel.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(duel)
    return _to_detail(db, duel, current_user.id, language)


@router.post("/{duel_id}/decline", response_model=DuelListItemOut)
def decline(duel_id: UUID, db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duel = db.query(Duel).filter(Duel.id == duel_id, Duel.opponent_id == current_user.id).first()
    if not duel:
        raise HTTPException(404, "Duel not found")
    duel = _expire_if_overdue(db, duel)
    if duel.status == "pending":
        duel.status = "declined"  # free — never touches accepted_at, so it never costs the daily allowance
        db.commit()
        db.refresh(duel)
    return _to_list_item(db, duel, current_user.id)


@router.post("/{duel_id}/start", response_model=DuelDetailOut)
def start(duel_id: UUID, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duel = _get_owned_duel(db, duel_id, current_user.id)
    duel = _expire_if_overdue(db, duel)

    # Same ordering fix as submit(): check MY OWN started state first. Once
    # I've started, this stays idempotent even after the row moves past
    # "active" (e.g. the other side finished and status is now "completed")
    # — only a genuine first start requires the duel to still be active.
    am_challenger = duel.challenger_id == current_user.id
    my_started = duel.challenger_started_at if am_challenger else duel.opponent_started_at
    if not my_started:
        if duel.status != "active":
            raise HTTPException(400, "duel_not_active")
        if am_challenger:
            duel.challenger_started_at = datetime.utcnow()
        else:
            duel.opponent_started_at = datetime.utcnow()
        db.commit()
        db.refresh(duel)
    return _to_detail(db, duel, current_user.id, language)


@router.post("/{duel_id}/submit", response_model=DuelDetailOut)
def submit(duel_id: UUID, body: ExamSubmitRequest, language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(require_duel_access)):
    duel = _get_owned_duel(db, duel_id, current_user.id)
    duel = _expire_if_overdue(db, duel)

    # Check MY OWN submission first, before the overall-status check — once
    # the other side finishes, duel.status flips to "completed" out from
    # under me, but a repeat call from a side that already submitted must
    # still behave idempotently (e.g. a client retry, or re-opening the
    # results screen), not error just because the row is no longer "active".
    am_challenger = duel.challenger_id == current_user.id
    already_submitted = duel.challenger_submitted_at if am_challenger else duel.opponent_submitted_at
    if already_submitted:
        return _to_detail(db, duel, current_user.id, language)  # idempotent — don't re-grade or re-award

    if duel.status != "active":
        raise HTTPException(400, "duel_not_active")

    # Grade against duel.language (fixed at accept time) — same "grade
    # against what was actually shown when answers were picked" rule as
    # the daily test.
    problems = _fetch_duel_problems(db, duel, duel.language)
    answers_out: dict = {}
    results_out: dict = {}
    score = 0
    for n in duel.question_numbers or []:
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

    now = datetime.utcnow()
    if am_challenger:
        duel.challenger_answers = answers_out
        duel.challenger_results = results_out
        duel.challenger_score = score
        duel.challenger_submitted_at = now
        duel.challenger_terminated_early = body.terminated
    else:
        duel.opponent_answers = answers_out
        duel.opponent_results = results_out
        duel.opponent_score = score
        duel.opponent_submitted_at = now
        duel.opponent_terminated_early = body.terminated
    db.commit()
    db.refresh(duel)

    _finalize_if_both_done(db, duel)
    return _to_detail(db, duel, current_user.id, language)
