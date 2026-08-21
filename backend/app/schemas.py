from __future__ import annotations
from datetime import datetime, date
from typing import Any, List, Optional
from uuid import UUID
from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ProfileOut(BaseModel):
    id: UUID
    name: str
    surname: str
    unique_id: Optional[str]
    role: str
    points: int
    is_active: bool
    username: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Topics ────────────────────────────────────────────────────────────────────

class TopicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    is_draft: bool = True
    language: str = "kz"

class TopicUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_draft: Optional[bool] = None
    is_published: Optional[bool] = None

class TopicOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    order_index: int
    is_draft: bool
    is_published: bool
    language: str = "kz"
    created_at: datetime

    class Config:
        from_attributes = True


# ── SubTopics ─────────────────────────────────────────────────────────────────

class SubTopicCreate(BaseModel):
    topic_id: UUID
    title: str
    is_draft: bool = True
    language: str = "kz"

class SubTopicUpdate(BaseModel):
    title: Optional[str] = None
    is_draft: Optional[bool] = None
    is_published: Optional[bool] = None

class SubTopicOut(BaseModel):
    id: UUID
    topic_id: UUID
    title: str
    order_index: int
    is_draft: bool
    is_published: bool
    language: str = "kz"
    created_at: datetime

    class Config:
        from_attributes = True


# ── Lessons ───────────────────────────────────────────────────────────────────

class LessonCreate(BaseModel):
    subtopic_id: UUID
    title: str
    explanation: Optional[str] = None
    content_blocks: Optional[List[Any]] = []
    is_draft: bool = True
    language: str = "kz"

class LessonUpdate(BaseModel):
    title: Optional[str] = None
    explanation: Optional[str] = None
    content_blocks: Optional[List[Any]] = None
    is_draft: Optional[bool] = None
    is_published: Optional[bool] = None

class LessonOut(BaseModel):
    id: UUID
    subtopic_id: UUID
    title: str
    explanation: Optional[str]
    content_blocks: Optional[List[Any]]
    order_index: int
    is_draft: bool
    is_published: bool
    language: str = "kz"
    created_at: datetime

    class Config:
        from_attributes = True


# ── Problems ──────────────────────────────────────────────────────────────────

class ProblemCreate(BaseModel):
    subsubtopic_id: UUID
    title: Optional[str] = None
    question: str
    problem_type: str = "mcq"           # "mcq" | "open"
    options: Optional[List[str]] = []
    correct_option: Optional[int] = 0   # legacy
    correct_options: Optional[List[int]] = []
    open_answer: Optional[Any] = None   # {"type":"single","value":42} | {"type":"set","values":[1,2]}
    image_url: Optional[str] = None
    hint1: Optional[str] = "Think carefully."
    hint2: Optional[str] = "Review the explanation."
    hint3: Optional[str] = "The answer relates to the key concept."
    is_hard: bool = False
    is_draft: bool = True
    level: Optional[str] = None

class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    question: Optional[str] = None
    problem_type: Optional[str] = None
    options: Optional[List[str]] = None
    correct_option: Optional[int] = None
    correct_options: Optional[List[int]] = None
    open_answer: Optional[Any] = None
    image_url: Optional[str] = None
    hint1: Optional[str] = None
    hint2: Optional[str] = None
    hint3: Optional[str] = None
    is_hard: Optional[bool] = None
    is_draft: Optional[bool] = None
    is_published: Optional[bool] = None
    level: Optional[str] = None

class ProblemOut(BaseModel):
    id: UUID
    subsubtopic_id: Optional[UUID]
    title: Optional[str]
    question: str
    problem_type: str
    options: Optional[List[str]]
    correct_option: Optional[int]
    correct_options: Optional[List[int]]
    open_answer: Optional[Any]
    image_url: Optional[str]
    hint1: Optional[str]
    hint2: Optional[str]
    hint3: Optional[str]
    is_hard: bool
    is_draft: bool
    is_published: bool
    order_index: int
    created_at: datetime
    # Bulk-upload fields
    level: Optional[str] = None
    number: Optional[int] = None
    answer_text: Optional[str] = None
    source_file_url: Optional[str] = None
    language: str = "kz"

    class Config:
        from_attributes = True


# ── Bulk upload ───────────────────────────────────────────────────────────────

class UploadError(BaseModel):
    zadacha: int
    reason: str

class SkippedLine(BaseModel):
    text: str
    reason: str

class UploadResult(BaseModel):
    imported: int
    auto_published: bool = False
    source_file_url: str
    lessons_created: int = 1
    errors: List[UploadError]
    skipped: List[SkippedLine]

class AttemptCreate(BaseModel):
    problem_id: UUID
    selected_options: Optional[List[int]] = []   # MCQ: list of selected option indices
    open_answer_given: Optional[str] = None       # Open: raw typed string
    hints_used: int = 0

class SkipCreate(BaseModel):
    problem_id: UUID

class AttemptOut(BaseModel):
    id: UUID
    student_id: UUID
    problem_id: UUID
    is_correct: bool
    hints_used: int
    points_earned: int
    selected_options: Optional[List[int]]
    open_answer_given: Optional[str]
    is_skip: bool = False
    attempted_at: datetime

    class Config:
        from_attributes = True


# ── Problem of Day ────────────────────────────────────────────────────────────

# Admin-facing: full bilingual row, one per scheduled day
class PodAdminOut(BaseModel):
    id: UUID
    date: date
    question_kz: str
    question_ru: str
    description_kz: Optional[str] = None
    description_ru: Optional[str] = None
    correct_answer: str
    active_from: datetime
    active_until: datetime
    created_at: datetime
    image_url: Optional[str] = None

    class Config:
        from_attributes = True

# Student-facing: only today's pod, resolved to the requested language
class PodStatusOut(BaseModel):
    status: str                    # "available" | "locked" | "none"
    pod_id: Optional[UUID] = None
    question: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

class PodAttemptCreate(BaseModel):
    pod_id: UUID
    answer: str

class PodAttemptOut(BaseModel):
    id: UUID
    student_id: UUID
    pod_id: UUID
    is_correct: bool
    points_earned: int
    answer: Optional[str]
    attempted_at: datetime

    class Config:
        from_attributes = True


# ── Progress ──────────────────────────────────────────────────────────────────

class ProgressCreate(BaseModel):
    subsubtopic_id: UUID

class ProgressOut(BaseModel):
    id: UUID
    student_id: UUID
    subsubtopic_id: UUID
    is_completed: bool
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Students (admin) ──────────────────────────────────────────────────────────

class StudentCreate(BaseModel):
    name: str
    surname: str
    username: str
    password: str

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    username: Optional[str] = None
    new_password: Optional[str] = None


# ── Leaderboard ───────────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    surname: str
    unique_id: Optional[str]
    points: int


# ── Publish helpers ───────────────────────────────────────────────────────────

class PublishRequest(BaseModel):
    published: bool


# ── Problem Reports ───────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    problem_id: UUID
    description: str

class ReportResolve(BaseModel):
    action: str                         # "fix" | "dismiss"
    admin_note: Optional[str] = None
    new_correct_options: Optional[List[int]] = None
    new_open_answer: Optional[Any] = None

class ReportOut(BaseModel):
    id: UUID
    problem_id: UUID
    student_id: UUID
    description: str
    status: str
    admin_note: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Test Bank ─────────────────────────────────────────────────────────────────

class TestBankProblemCreate(BaseModel):
    number: int
    language: str = "kz"
    question: str
    problem_type: str = "mcq"           # "mcq" | "open"
    options: Optional[List[str]] = []
    correct_option: Optional[int] = 0
    correct_options: Optional[List[int]] = []
    open_answer: Optional[Any] = None
    image_url: Optional[str] = None
    is_draft: bool = False

class TestBankProblemUpdate(BaseModel):
    number: Optional[int] = None
    question: Optional[str] = None
    problem_type: Optional[str] = None
    options: Optional[List[str]] = None
    correct_option: Optional[int] = None
    correct_options: Optional[List[int]] = None
    open_answer: Optional[Any] = None
    image_url: Optional[str] = None

class TestBankProblemOut(BaseModel):
    id: UUID
    number: int
    language: str
    question: str
    problem_type: str
    options: Optional[List[str]]
    correct_option: Optional[int]
    correct_options: Optional[List[int]]
    open_answer: Optional[Any]
    image_url: Optional[str]
    is_published: bool
    is_draft: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Question shape sent to the student while an exam is in progress — no answer key included
class ExamQuestionOut(BaseModel):
    id: UUID
    number: int
    question: str
    problem_type: str
    options: Optional[List[str]]
    image_url: Optional[str]

class ExamAnswerIn(BaseModel):
    selected_options: Optional[List[int]] = None
    open_answer_given: Optional[str] = None

class ExamSubmitRequest(BaseModel):
    answers: dict[str, ExamAnswerIn]   # keyed by str(number)
    terminated: bool = False

class ExamResultRow(BaseModel):
    number: int
    question: str
    problem_type: str
    given_selected_options: Optional[List[int]] = None
    given_open_answer: Optional[str] = None
    is_correct: bool

class ExamStatusOut(BaseModel):
    status: str                          # "not_started" | "in_progress" | "submitted"
    started_at: Optional[datetime] = None
    duration_seconds: int = 1800
    questions: Optional[List[ExamQuestionOut]] = None
    results: Optional[List[ExamResultRow]] = None
    score: Optional[int] = None
    total: Optional[int] = None
    terminated_early: Optional[bool] = None
