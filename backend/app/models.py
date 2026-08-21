import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Date, JSON, ForeignKey, Text
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


class Topic(Base):
    __tablename__ = "topics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    order_index = Column(Integer, default=0)
    is_draft = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    language = Column(String, nullable=False, default="kz", server_default="kz")
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
    hint2 = Column(String, nullable=True, default="Review the explanation.")
    hint3 = Column(String, nullable=True, default="The answer relates to the key concept.")
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
    created_at = Column(DateTime, default=datetime.utcnow)
