import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Date, JSON, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=False)
    plain_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    surname = Column(String, nullable=False)
    unique_id = Column(String, nullable=True)
    role = Column(String, nullable=False, default="student")
    points = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, server_default='true')
    created_at = Column(DateTime, default=datetime.utcnow)

    # Streaks — touched incrementally on each qualifying action (see
    # app/streaks.py), never bulk-reset on a schedule. current_streak is the
    # student's own count of confirmed real value; longest_streak never goes
    # down. freeze_week_key/freeze_used_this_week track the one missed-day
    # grace per calendar week, lazily rolled over the same way MonthlyScore's
    # period_key is — no scheduled job zeroes anything.
    current_streak = Column(Integer, default=0, server_default='0')
    longest_streak = Column(Integer, default=0, server_default='0')
    last_streak_date = Column(Date, nullable=True)
    freeze_week_key = Column(String, nullable=True)
    freeze_used_this_week = Column(Boolean, default=False, server_default='false')

    # Cosmetics — what's currently equipped. Selecting something new is
    # gated by this period's MonthlyScore (see app/cosmetics.py), but once
    # equipped it's kept even if a slower period follows — never revoked.
    equipped_border_color = Column(String, nullable=True)
    equipped_avatar_icon = Column(String, nullable=True)

    # Flags the ~20 seeded "fake student" leaderboard-filler accounts (see
    # backend/manage_fake_students.py) — and, more generally, any account
    # that shouldn't be selectable as a Duel opponent (test/QA accounts,
    # etc.) — as non-interactive for that purpose. Doesn't stop the flagged
    # account from acting itself; a test account still needs to be able to
    # duel another test account, it just shouldn't show up in a REAL
    # student's opponent picker.
    is_decorative = Column(Boolean, default=False, server_default='false')

    # A per-student opt-out of Duel entirely — can't challenge, be
    # challenged, or otherwise touch any duel endpoint (see
    # require_duel_access in routers/duels.py). Unlike is_decorative, this
    # blocks the account's OWN actions, not just whether others can select
    # it. Off by default; set per-student as needed (currently just via a
    # direct DB update, no admin UI toggle yet).
    duel_disabled = Column(Boolean, default=False, server_default='false')


class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    order_index = Column(Integer, default=0)
    is_draft = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    language = Column(String, nullable=False, default="kz", server_default="kz")
    # Shared between this topic's kz row and its ru counterpart (same content,
    # different language) so progress/navigation can treat them as one thing.
    pair_key = Column(UUID(as_uuid=True), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    subtopics = relationship(
        "SubTopic", back_populates="topic",
        cascade="all, delete-orphan", order_by="SubTopic.order_index"
    )


class SubTopic(Base):
    __tablename__ = "subtopics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic_id = Column(UUID(as_uuid=True), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    order_index = Column(Integer, default=0)
    is_draft = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    language = Column(String, nullable=False, default="kz", server_default="kz")
    pair_key = Column(UUID(as_uuid=True), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    topic = relationship("Topic", back_populates="subtopics")
    lessons = relationship(
        "Lesson", back_populates="subtopic",
        cascade="all, delete-orphan", order_by="Lesson.order_index"
    )


class Lesson(Base):
    __tablename__ = "subsubtopics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subtopic_id = Column(UUID(as_uuid=True), ForeignKey("subtopics.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    explanation = Column(Text, nullable=True)
    content_blocks = Column(JSON, default=list)
    order_index = Column(Integer, default=0)
    is_draft = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    language = Column(String, nullable=False, default="kz", server_default="kz")
    pair_key = Column(UUID(as_uuid=True), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    subtopic = relationship("SubTopic", back_populates="lessons")
    problems = relationship("Problem", back_populates="lesson", cascade="all, delete-orphan")


class Problem(Base):
    __tablename__ = "problems"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subsubtopic_id = Column(UUID(as_uuid=True), ForeignKey("subsubtopics.id", ondelete="CASCADE"), nullable=True)
    title = Column(String, nullable=True)
    question = Column(Text, nullable=False)
    # MCQ fields
    options = Column(JSON, default=list)
    correct_option = Column(Integer, default=0)         # legacy single-answer
    correct_options = Column(JSON, default=list)        # new multi-answer list e.g. [0, 2]
    # Open question fields
    problem_type = Column(String, default="mcq")        # "mcq" | "open"
    open_answer = Column(JSON, nullable=True)           # {"type":"single","value":42} | {"type":"set","values":[1,2]}
    image_url = Column(String, nullable=True)
    hint1 = Column(String, nullable=True, default="Think carefully.")
    is_hard = Column(Boolean, default=False)
    is_draft = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Bulk-upload fields
    level = Column(String, nullable=True)          # "А", "В", "С" from docx level header
    number = Column(Integer, nullable=True)         # problem number within the docx
    answer_text = Column(Text, nullable=True)       # raw text answer from docx
    source_file_url = Column(String, nullable=True) # R2 URL of the uploaded .docx
    pair_key = Column(UUID(as_uuid=True), nullable=True, index=True)
    language = Column(String, nullable=False, default="kz", server_default="kz")

    lesson = relationship("Lesson", back_populates="problems")
    reports = relationship("ProblemReport", back_populates="problem", cascade="all, delete-orphan")


class ProblemOfDay(Base):
    __tablename__ = "problems_of_day"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, unique=True, nullable=False)  # its queue position/scheduled day
    question_kz = Column(Text, nullable=False)
    question_ru = Column(Text, nullable=False)
    description_kz = Column(Text, nullable=True)
    description_ru = Column(Text, nullable=True)
    correct_answer = Column(String, nullable=False)   # shared across both languages
    active_from = Column(DateTime, nullable=False)
    active_until = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    image_url = Column(String, nullable=True)          # shared across both languages


class ProblemAttempt(Base):
    __tablename__ = "problem_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    hints_used = Column(Integer, default=0)
    points_earned = Column(Integer, default=0)
    selected_options = Column(JSON, default=list)       # MCQ: [0] or [0, 2]
    open_answer_given = Column(String, nullable=True)   # Open: raw string typed by student
    is_skip = Column(Boolean, default=False, server_default='false')  # student explicitly skipped, not a real answer
    # True for the synthetic echo written onto a problem's pair_key sibling
    # (other language) when the real attempt happens on this problem's
    # counterpart — keeps per-problem status (best-attempt, level-unlock,
    # "already answered") language-consistent without being a real activity
    # event itself, so it's excluded from activity-style stats (total
    # attempts, problems-solved count) to avoid double-counting.
    is_mirror = Column(Boolean, default=False, server_default='false')
    attempted_at = Column(DateTime, default=datetime.utcnow)


class PodAttempt(Base):
    __tablename__ = "pod_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    pod_id = Column(UUID(as_uuid=True), ForeignKey("problems_of_day.id", ondelete="CASCADE"), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    points_earned = Column(Integer, default=0)
    answer = Column(String, nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow)


class StudentProgress(Base):
    __tablename__ = "student_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    subsubtopic_id = Column(UUID(as_uuid=True), ForeignKey("subsubtopics.id", ondelete="CASCADE"), nullable=False)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    # True for the synthetic echo written onto this lesson's pair_key sibling
    # (other language) when the lesson was actually completed in its
    # counterpart — excluded from the lessons_completed stat to avoid
    # double-counting one conceptual lesson done in either language.
    is_mirror = Column(Boolean, default=False, server_default='false')


class ProblemReport(Base):
    __tablename__ = "problem_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String, default="pending")          # "pending" | "resolved" | "dismissed"
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    problem = relationship("Problem", back_populates="reports")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


class MonthlyScore(Base):
    """A student's points earned within one scoring period, kept entirely
    separate from Profile.points (the lifetime total, which never resets).
    One row per (student, period) — a new period gets a fresh row starting
    at 0 rather than any existing row ever being zeroed out, so past
    periods stay permanently on the record instead of being destructively
    overwritten (see app/scoring.py for how period_key is derived — periods
    are calendar months, except the first period which deliberately spans
    both August and September 2026 combined)."""
    __tablename__ = "monthly_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    period_key = Column(String, nullable=False)   # e.g. "2026-08_09", "2026-10", "2026-11", ...
    points = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "period_key", name="uq_monthly_score_student_period"),
    )


class TestBankProblem(Base):
    """A standalone question pool, independent of Topic/SubTopic/Lesson.
    Field names deliberately mirror Problem so the existing MCQ/open grading
    helpers in routers/problems.py can be reused unchanged."""
    __tablename__ = "test_bank_problems"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number = Column(Integer, nullable=False, index=True)  # cross-language canonical identity
    language = Column(String, nullable=False, default="kz")
    question = Column(Text, nullable=False)
    problem_type = Column(String, default="mcq")          # "mcq" | "open"
    options = Column(JSON, default=list)
    correct_option = Column(Integer, default=0)
    correct_options = Column(JSON, default=list)
    open_answer = Column(JSON, nullable=True)
    answer_text = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    is_published = Column(Boolean, default=False)
    is_draft = Column(Boolean, default=True)
    source_file_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyExam(Base):
    """One row per student per calendar day (UTC+5) — both the day's randomly
    assigned question set and the attempt record. 'Already seen' numbers are
    derived as the union of question_numbers across a student's past rows."""
    __tablename__ = "daily_exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    exam_date = Column(Date, nullable=False)
    language = Column(String, nullable=False, default="kz")
    question_numbers = Column(JSON, default=list)   # [int, ...] fixed at creation, presentation order
    started_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    terminated_early = Column(Boolean, default=False)
    answers = Column(JSON, default=dict)             # {"<number>": {"selected_options":[...]}|{"open_answer_given": "..."}}
    results = Column(JSON, default=dict)             # {"<number>": {"is_correct": bool}}
    score = Column(Integer, default=0)


class Duel(Base):
    """An asynchronous 1v1 challenge over a small shared set of Test Bank
    questions. Exactly two participants for the row's whole life, so state
    lives as challenger_*/opponent_* column pairs on one row rather than a
    child table — same single-row-per-attempt style as DailyExam, just
    duplicated per side instead of per student.

    question_numbers is picked once, at accept time (see routers/duels.py),
    so both sides answer the identical set — like DailyExam.question_numbers,
    fixed at creation. Each side resolves those numbers to TestBankProblem
    rows in their own display language independently, so a kz-preferring and
    ru-preferring student can duel each other without a language mismatch.

    The whole duel has one 24-hour window measured from created_at (not from
    accepted_at) — see _expire_if_overdue in routers/duels.py. There is no
    scheduled cleanup job; an overdue pending/active duel is flipped to
    'expired' lazily, the moment any endpoint next touches it — same style
    as MonthlyScore's period_key and the streak freeze's week_key.

    status: 'pending' -> 'declined' | 'expired' | 'active' -> 'completed' | 'expired'
    """
    __tablename__ = "duels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenger_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    opponent_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)  # anchors the 24h window for the WHOLE duel
    accepted_at = Column(DateTime, nullable=True)           # null until accept (declining never sets it) —
                                                              # used to tell whether a completed duel resolved
                                                              # "today" for the daily cap (see _completed_today
                                                              # in routers/duels.py); a still-open pending
                                                              # challenge never counts against that cap at all,
                                                              # only an accepted-and-resolved one does
    language = Column(String, nullable=False, default="kz")  # language the question pool was drawn from at accept

    # Shared, fixed at accept time — same numbers for both sides
    question_numbers = Column(JSON, default=list)

    # Per-side sitting: independent timers, independently started
    challenger_started_at = Column(DateTime, nullable=True)
    opponent_started_at = Column(DateTime, nullable=True)
    challenger_submitted_at = Column(DateTime, nullable=True)
    opponent_submitted_at = Column(DateTime, nullable=True)
    challenger_terminated_early = Column(Boolean, default=False, server_default='false')
    opponent_terminated_early = Column(Boolean, default=False, server_default='false')
    challenger_answers = Column(JSON, default=dict)   # same shape as DailyExam.answers
    opponent_answers = Column(JSON, default=dict)
    challenger_results = Column(JSON, default=dict)   # same shape as DailyExam.results
    opponent_results = Column(JSON, default=dict)
    challenger_score = Column(Integer, default=0)
    opponent_score = Column(Integer, default=0)

    # Completion — set exactly once, at the moment BOTH sides have submitted
    # (see _finalize_if_both_done). Points are stored, not re-derived from
    # current constants at read time, so a later tuning of POINTS_PER_CORRECT/
    # WINNER_BONUS never rewrites a historical duel's payout — same
    # immutable-past-period principle as MonthlyScore rows.
    winner_id = Column(UUID(as_uuid=True), nullable=True)   # null = tie, or not yet completed
    points_awarded = Column(Boolean, default=False, server_default='false')  # idempotency guard
    challenger_points_awarded = Column(Integer, default=0)
    opponent_points_awarded = Column(Integer, default=0)


class WeeklyMission(Base):
    """An admin-created weekly mission instance. goal_type is one of a
    small fixed set defined in app/missions.py (GOAL_TYPES) — the admin
    only ever picks a type + a target number + a week, never free-form
    logic or text, so there's no way to publish a broken/mistranslated
    mission. Display text is generated from goal_type+target at read time."""
    __tablename__ = "weekly_missions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_type = Column(String, nullable=False)
    target = Column(Integer, nullable=False)
    reward_points = Column(Integer, nullable=False, default=20)
    week_start = Column(Date, nullable=False)
    week_end = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudentMissionProgress(Base):
    __tablename__ = "student_mission_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    mission_id = Column(UUID(as_uuid=True), ForeignKey("weekly_missions.id", ondelete="CASCADE"), nullable=False)
    progress = Column(Integer, nullable=False, default=0)
    completed_at = Column(DateTime, nullable=True)
    points_awarded = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("student_id", "mission_id", name="uq_mission_progress_student_mission"),
    )
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    """A broadcast announcement shown to every student — release notes for
    new features, in effect. Free-text (unlike WeeklyMission's fixed
    catalog): these are authored one at a time by a human for a specific
    ship event, not generated/repeated on a schedule, so there's no
    class of "bad admin input" to design away here the way there was for
    missions. One row reaches every student; per-student read state lives
    in NotificationRead below rather than a boolean here."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    icon = Column(String, nullable=True)  # a single emoji shown next to the title
    title_kz = Column(String, nullable=False)
    title_ru = Column(String, nullable=False)
    body_kz = Column(Text, nullable=False)
    body_ru = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationRead(Base):
    __tablename__ = "notification_reads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    notification_id = Column(UUID(as_uuid=True), ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("student_id", "notification_id", name="uq_notification_read_student_notification"),
    )
