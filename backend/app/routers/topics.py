from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Topic, SubTopic, Lesson, Problem, Profile
from ..schemas import (
    TopicCreate, TopicUpdate, TopicOut,
    SubTopicCreate, SubTopicUpdate, SubTopicOut,
    LessonCreate, LessonUpdate, LessonOut,
    ProblemOut,
)
from ..auth import get_current_user, require_admin
from ..docx_lesson_parser import parse_docx_lesson
from ..storage import upload_file_bytes

router = APIRouter(prefix="/topics", tags=["topics"])

_IMG_EXT = {
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/gif': '.gif', 'image/webp': '.webp',
}


# ── Topics ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TopicOut])
def list_topics(language: str = "kz", db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Topic).filter(Topic.language == language).order_by(Topic.order_index).all()


@router.get("/translate")
def translate_id(
        type: str,
        id: UUID,
        target_language: str,
        db: Session = Depends(get_db),
        _=Depends(get_current_user),
):
    """Resolve a topic/lesson id to its pair_key counterpart in another
    language — lets the frontend switch the KZ/RU toggle while inside a
    specific topic/lesson/test page and land on the *same content*, instead
    of the language switch only re-skinning the UI chrome around stale
    content. Returns {"id": null} if there's no linked counterpart (content
    without a pair_key, or not yet backfilled)."""
    model = {"topic": Topic, "lesson": Lesson}.get(type)
    if model is None:
        raise HTTPException(400, "type must be 'topic' or 'lesson'")

    row = db.query(model).filter(model.id == id).first()
    if not row or not row.pair_key:
        return {"id": None}

    counterpart = (
        db.query(model)
        .filter(model.pair_key == row.pair_key, model.language == target_language)
        .first()
    )
    return {"id": str(counterpart.id) if counterpart else None}


@router.post("", response_model=TopicOut)
def create_topic(body: TopicCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(Topic).filter(Topic.language == body.language).count()
    topic = Topic(
        title=body.title,
        description=body.description,
        is_draft=body.is_draft,
        is_published=False,
        order_index=count,
        language=body.language,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.put("/{topic_id}", response_model=TopicOut)
def update_topic(topic_id: UUID, body: TopicUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(404, "Topic not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(topic, field, value)
    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{topic_id}")
def delete_topic(topic_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(404, "Topic not found")
    db.delete(topic)
    db.commit()
    return {"ok": True}


@router.post("/{topic_id}/publish")
def publish_topic(topic_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(404, "Topic not found")
    topic.is_published = True
    topic.is_draft = False
    for sub in db.query(SubTopic).filter(SubTopic.topic_id == topic_id, SubTopic.is_draft == False).all():
        sub.is_published = True
        for lesson in db.query(Lesson).filter(Lesson.subtopic_id == sub.id).all():
            lesson.is_published = True
            lesson.is_draft = False
            db.query(Problem).filter(Problem.subsubtopic_id == lesson.id).update({"is_published": True, "is_draft": False})
    db.commit()
    return {"ok": True}


@router.post("/{topic_id}/unpublish")
def unpublish_topic(topic_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(404, "Topic not found")
    topic.is_published = False
    for sub in db.query(SubTopic).filter(SubTopic.topic_id == topic_id).all():
        sub.is_published = False
        for lesson in db.query(Lesson).filter(Lesson.subtopic_id == sub.id).all():
            lesson.is_published = False
            db.query(Problem).filter(Problem.subsubtopic_id == lesson.id).update({"is_published": False})
    db.commit()
    return {"ok": True}


# ── SubTopics ─────────────────────────────────────────────────────────────────

@router.get("/{topic_id}/subtopics", response_model=list[SubTopicOut])
def list_subtopics(topic_id: UUID, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(SubTopic).filter(SubTopic.topic_id == topic_id).order_by(SubTopic.order_index).all()


@router.post("/subtopics", response_model=SubTopicOut)
def create_subtopic(body: SubTopicCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(SubTopic).filter(SubTopic.topic_id == body.topic_id).count()
    sub = SubTopic(
        topic_id=body.topic_id,
        title=body.title,
        is_draft=body.is_draft,
        is_published=False,
        order_index=count,
        language=body.language,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.put("/subtopics/{sub_id}", response_model=SubTopicOut)
def update_subtopic(sub_id: UUID, body: SubTopicUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    sub = db.query(SubTopic).filter(SubTopic.id == sub_id).first()
    if not sub:
        raise HTTPException(404, "Subtopic not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sub, field, value)
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/subtopics/{sub_id}")
def delete_subtopic(sub_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    sub = db.query(SubTopic).filter(SubTopic.id == sub_id).first()
    if not sub:
        raise HTTPException(404, "Subtopic not found")
    db.delete(sub)
    db.commit()
    return {"ok": True}


@router.post("/subtopics/{sub_id}/publish")
def publish_subtopic(sub_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    sub = db.query(SubTopic).filter(SubTopic.id == sub_id).first()
    if not sub:
        raise HTTPException(404)
    parent = db.query(Topic).filter(Topic.id == sub.topic_id).first()
    if not parent or parent.is_draft:
        raise HTTPException(400, "Parent topic must be saved (not draft) before publishing subtopic")
    sub.is_published = True
    sub.is_draft = False
    for lesson in db.query(Lesson).filter(Lesson.subtopic_id == sub_id).all():
        lesson.is_published = True
        lesson.is_draft = False
        db.query(Problem).filter(Problem.subsubtopic_id == lesson.id).update({"is_published": True, "is_draft": False})
    db.commit()
    return {"ok": True}


@router.post("/subtopics/{sub_id}/unpublish")
def unpublish_subtopic(sub_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    sub = db.query(SubTopic).filter(SubTopic.id == sub_id).first()
    if not sub:
        raise HTTPException(404)
    sub.is_published = False
    for lesson in db.query(Lesson).filter(Lesson.subtopic_id == sub_id).all():
        lesson.is_published = False
        db.query(Problem).filter(Problem.subsubtopic_id == lesson.id).update({"is_published": False})
    db.commit()
    return {"ok": True}


# ── Lessons ───────────────────────────────────────────────────────────────────

@router.get("/subtopics/{sub_id}/lessons", response_model=list[LessonOut])
def list_lessons(sub_id: UUID, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Lesson).filter(Lesson.subtopic_id == sub_id).order_by(Lesson.order_index).all()


@router.get("/lessons/{lesson_id}", response_model=LessonOut)
def get_lesson(lesson_id: UUID, db: Session = Depends(get_db), _=Depends(get_current_user)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    return lesson


@router.post("/lessons", response_model=LessonOut)
def create_lesson(body: LessonCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(Lesson).filter(Lesson.subtopic_id == body.subtopic_id).count()
    lesson = Lesson(
        subtopic_id=body.subtopic_id,
        title=body.title,
        explanation=body.explanation,
        content_blocks=body.content_blocks or [],
        is_draft=body.is_draft,
        is_published=False,
        order_index=count,
        language=body.language,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.post("/lessons/upload-docx", response_model=LessonOut)
async def upload_lesson_docx(
    file: UploadFile = File(...),
    subtopic_id: UUID = Form(...),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Upload a .docx file and create a lesson with rich content blocks (headings, text, images, formulas)."""
    if not (file.filename or '').lower().endswith('.docx'):
        raise HTTPException(400, "Only .docx files are supported")

    sub = db.query(SubTopic).filter(SubTopic.id == subtopic_id).first()
    if not sub:
        raise HTTPException(404, "Subtopic not found")

    content = await file.read()
    blocks, raw_images = parse_docx_lesson(content)

    # Upload images to R2 and replace __img_N__ placeholders
    for idx, (img_bytes, ctype) in enumerate(raw_images):
        ext = _IMG_EXT.get(ctype, '.png')
        url = upload_file_bytes(img_bytes, f'lesson_img{ext}', folder='lesson-images/', content_type=ctype)
        for block in blocks:
            if block.get('url') == f'__img_{idx}__':
                block['url'] = url

    raw_name = file.filename or 'lesson.docx'
    title = raw_name[:-5] if raw_name.lower().endswith('.docx') else raw_name
    auto_publish = sub.is_published

    # Shift all existing lessons up so the content lesson is always first (order_index 0)
    db.query(Lesson).filter(Lesson.subtopic_id == subtopic_id).update(
        {"order_index": Lesson.order_index + 1},
        synchronize_session=False,
    )

    lesson = Lesson(
        subtopic_id=subtopic_id,
        title=title,
        explanation='',
        content_blocks=blocks,
        order_index=0,
        is_draft=False,
        is_published=auto_publish,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.post("/admin/upload-image")
async def upload_admin_image(file: UploadFile = File(...), _=Depends(require_admin)):
    """Generic single-image upload used by any admin image picker (lesson content
    blocks, problem/test images, etc.) — uploads to storage and returns the URL."""
    ctype = file.content_type or ''
    if not ctype.startswith('image/'):
        raise HTTPException(400, "Only image files are supported")
    content = await file.read()
    ext = _IMG_EXT.get(ctype, '.png')
    url = upload_file_bytes(content, f'upload{ext}', folder='content-images/', content_type=ctype)
    return {"url": url}


@router.put("/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(lesson_id: UUID, body: LessonUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(lesson, field, value)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404)
    db.delete(lesson)
    db.commit()
    return {"ok": True}


@router.post("/lessons/{lesson_id}/publish")
def publish_lesson(lesson_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404)
    parent = db.query(SubTopic).filter(SubTopic.id == lesson.subtopic_id).first()
    if not parent or parent.is_draft:
        raise HTTPException(400, "Parent subtopic must be saved before publishing lesson")
    lesson.is_published = True
    lesson.is_draft = False
    db.query(Problem).filter(Problem.subsubtopic_id == lesson_id).update({"is_published": True, "is_draft": False})
    db.commit()
    return {"ok": True}


@router.post("/lessons/{lesson_id}/unpublish")
def unpublish_lesson(lesson_id: UUID, db: Session = Depends(get_db), _=Depends(require_admin)):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(404)
    lesson.is_published = False
    db.query(Problem).filter(Problem.subsubtopic_id == lesson_id).update({"is_published": False})
    db.commit()
    return {"ok": True}


# ── Student: full topic tree with progress ─────────────────────────────────────

@router.get("/tree", response_model=list)
def topic_tree(language: str = "kz", db: Session = Depends(get_db), current_user: Profile = Depends(get_current_user)):
    from ..models import StudentProgress, ProblemAttempt

    topics = db.query(Topic).filter(Topic.language == language).order_by(Topic.order_index).all()

    # For students, compute which problems they've dealt with at all (any
    # attempt — correct, wrong, or an explicitly recorded skip) vs. only the
    # ones they got correct. "Finished" a test means every question was gone
    # through (level A/B/C all the way to the end), not that every answer was
    # correct — so completion is driven by attempted_problem_ids, not
    # correct_problem_ids.
    if current_user.role == "student":
        attempted_problem_ids: set[str] = set()
        correct_problem_ids: set[str] = set()
        for a in db.query(ProblemAttempt).filter(ProblemAttempt.student_id == current_user.id).all():
            attempted_problem_ids.add(str(a.problem_id))
            if a.is_correct:
                correct_problem_ids.add(str(a.problem_id))
        # StudentProgress is used for explanation-only lessons (no problems)
        progress_lesson_ids = {
            str(p.subsubtopic_id)
            for p in db.query(StudentProgress).filter(
                StudentProgress.student_id == current_user.id,
                StudentProgress.is_completed == True,
            ).all()
        }
    else:
        attempted_problem_ids = set()
        correct_problem_ids = set()
        progress_lesson_ids = set()

    def lesson_is_completed(lesson, published_problems):
        if not published_problems:
            return str(lesson.id) in progress_lesson_ids
        return all(str(p.id) in attempted_problem_ids for p in published_problems)

    result = []
    for topic in topics:
        subtopics_data = []
        for sub in db.query(SubTopic).filter(SubTopic.topic_id == topic.id).order_by(SubTopic.order_index).all():
            lessons_data = []
            for lesson in db.query(Lesson).filter(Lesson.subtopic_id == sub.id).order_by(Lesson.order_index).all():
                published_problems = [p for p in lesson.problems if p.is_published]
                has_content = (
                    bool(lesson.explanation and lesson.explanation.strip())
                    or bool(lesson.content_blocks)
                    or len(published_problems) > 0
                )
                completed = lesson_is_completed(lesson, published_problems) if current_user.role == "student" else False
                attempted_count = (
                    sum(1 for p in published_problems if str(p.id) in attempted_problem_ids)
                    if current_user.role == "student" else 0
                )
                lessons_data.append({
                    "id": str(lesson.id),
                    "title": lesson.title,
                    "explanation": lesson.explanation,
                    "content_blocks": lesson.content_blocks or [],
                    "is_completed": completed,
                    "has_content": has_content,
                    "problem_count": len(published_problems),
                    "attempted_count": attempted_count,
                    "is_draft": lesson.is_draft,
                    "is_published": lesson.is_published,
                    "order_index": lesson.order_index,
                })
            subtopics_data.append({
                "id": str(sub.id),
                "title": sub.title,
                "order_index": sub.order_index,
                "is_draft": sub.is_draft,
                "is_published": sub.is_published,
                "lessons": lessons_data,
            })

        all_with_content = [l for s in subtopics_data for l in s["lessons"] if l["has_content"]]
        result.append({
            "id": str(topic.id),
            "title": topic.title,
            "description": topic.description,
            "order_index": topic.order_index,
            "is_draft": topic.is_draft,
            "is_published": topic.is_published,
            "subtopics": subtopics_data,
            "completed_lessons": sum(1 for l in all_with_content if l["is_completed"]),
            "total_lessons": len(all_with_content),
        })
    return result
