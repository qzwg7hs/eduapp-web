"""
Parse a .docx problem set file into structured problem records.

Expected format (repeating blocks):
    Уровень А (Базовые задачи)
    Задача 1. <question text, may contain $inline$ or $$display$$ LaTeX>
    Ответ 1: <answer text>
    ...
    Уровень В (...)
    ...

Handles:
- Answers that are bold or not bold
- Paragraphs that contain embedded line-breaks (Shift+Enter in Word)
- Multi-paragraph answers (continuation after "Ответ N:")
- Images embedded in question paragraphs (returned as raw bytes per problem)
- Flags any Задача without a matching Ответ as an error
"""

from __future__ import annotations
import io
import re
from typing import Any

from docx import Document
from docx.oxml.ns import qn


ParsedProblem = dict[str, Any]   # {level, number, question, answer, images}
ParseError    = dict[str, Any]   # {zadacha, reason}
Skipped       = dict[str, Any]   # {text, reason}


def _para_images(para, doc) -> list[tuple[bytes, str]]:
    imgs = []
    for blip in para._element.iter(qn('a:blip')):
        r_id = blip.get(qn('r:embed'))
        if r_id and r_id in doc.part.related_parts:
            part = doc.part.related_parts[r_id]
            imgs.append((part.blob, part.content_type or 'image/png'))
    return imgs


def parse_docx_problems(content: bytes) -> tuple[list[ParsedProblem], list[ParseError], list[Skipped]]:
    doc = Document(io.BytesIO(content))

    current_level: str | None = None
    questions: dict[int, dict] = {}   # num -> {level, parts, number, images}
    answers:   dict[int, list] = {}   # num -> [str parts]
    current_q_num: int | None = None
    current_a_num: int | None = None
    skipped: list[Skipped] = []

    for para in doc.paragraphs:
        # Collect any images in this paragraph
        para_imgs = _para_images(para, doc)

        raw = para.text.strip()

        # A paragraph can contain embedded line-breaks (w:br); split on \n
        lines = [l.strip() for l in raw.split('\n') if l.strip()]

        # If the paragraph has no text but has images, attach to current question
        if not lines:
            if para_imgs and current_q_num is not None:
                questions[current_q_num]['images'].extend(para_imgs)
            continue

        for line in lines:
            # ── Level header ────────────────────────────────────────────────
            lm = re.match(r'^Уровень\s+(\S+)\s*[\(（]', line)
            if lm:
                current_level = lm.group(1)
                current_q_num = None
                current_a_num = None
                continue

            # ── Question start: "Задача N. text" ───────────────────────────
            qm = re.match(r'^Задача\s+(\d+)[.\)]\s*(.*)', line, re.DOTALL)
            if qm:
                num = int(qm.group(1))
                rest = qm.group(2).strip()
                questions[num] = {
                    'level':  current_level,
                    'parts':  [rest] if rest else [],
                    'number': num,
                    'images': list(para_imgs),  # images from the question paragraph
                }
                current_q_num = num
                current_a_num = None
                continue

            # ── Answer start: "Ответ N: text" ──────────────────────────────
            am = re.match(r'^Ответ\s+(\d+)[:\.]\s*(.*)', line, re.DOTALL)
            if am:
                num = int(am.group(1))
                rest = am.group(2).strip()
                answers[num] = [rest] if rest else []
                current_a_num = num
                current_q_num = None
                continue

            # ── Continuation ────────────────────────────────────────────────
            if current_a_num is not None:
                answers[current_a_num].append(line)
            elif current_q_num is not None:
                questions[current_q_num]['parts'].append(line)
                questions[current_q_num]['images'].extend(para_imgs)
            else:
                skipped.append({'text': line[:100], 'reason': 'No active question or answer context'})

    # Build result
    parsed: list[ParsedProblem] = []
    errors: list[ParseError]    = []

    for num in sorted(questions.keys()):
        q = questions[num]
        question_text = ' '.join(q['parts']).strip()
        if num not in answers:
            errors.append({'zadacha': num, 'reason': f'Задача {num} has no matching Ответ'})
        else:
            raw_answer = ' '.join(answers[num]).strip().rstrip('.')
            parsed.append({
                'level':    q['level'],
                'number':   num,
                'question': question_text,
                'answer':   raw_answer,
                'images':   q.get('images', []),
            })

    return parsed, errors, skipped
