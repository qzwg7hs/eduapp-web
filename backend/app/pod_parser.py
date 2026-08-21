"""
Parse a "Problem of the Day" bulk .docx — a sequence of problems, each of
which becomes ONE calendar day's Problem of the Day, in file order.

Expected paragraph sequence (repeating blocks):
    [ЗАДАЧА N]              <- starts a new problem (N is just a label in the
                                file; the actual scheduled date is assigned by
                                the caller in sequence, not read from N)
    [ҚАЗАҚША]
    <question text in Kazakh, may contain $...$ / $$...$$ LaTeX>
    [РУССКИЙ]
    <question text in Russian>
    [ИЗОБРАЖЕНИЕ]            <- optional; one shared image for the problem
    [ОТВЕТ]
    <answer text, shared across both languages>

Empty paragraphs are skipped throughout.
"""
from __future__ import annotations
import io
import re
from typing import Any

from docx import Document
from docx.oxml.ns import qn

ParsedPod = dict[str, Any]
ParseError = dict[str, Any]

_TAG_RE = re.compile(r'^\[(.+?)\]\s*$')
_ZADACHA_RE = re.compile(r'^\[ЗАДАЧА\s+(\d+)\]\s*$')

_KZ_TAGS = {'ҚАЗАҚША', 'KAZAKH', 'KZ'}
_RU_TAGS = {'РУССКИЙ', 'RUSSIAN', 'RU'}
_IMAGE_TAGS = {'ИЗОБРАЖЕНИЕ', 'IMAGE'}
_ANSWER_TAGS = {'ОТВЕТ', 'ANSWER'}


def _para_images(para, doc) -> list[tuple[bytes, str]]:
    imgs = []
    for blip in para._element.iter(qn('a:blip')):
        r_id = blip.get(qn('r:embed'))
        if r_id and r_id in doc.part.related_parts:
            part = doc.part.related_parts[r_id]
            imgs.append((part.blob, part.content_type or 'image/png'))
    return imgs


def parse_pod_docx(content: bytes) -> tuple[list[ParsedPod], list[ParseError]]:
    doc = Document(io.BytesIO(content))

    current_num: int | None = None
    current_field: str | None = None
    kz_parts: list[str] = []
    ru_parts: list[str] = []
    answer_parts: list[str] = []
    images: list[tuple[bytes, str]] = []

    parsed: list[ParsedPod] = []
    errors: list[ParseError] = []

    def flush() -> None:
        nonlocal current_num, current_field
        if current_num is None:
            return

        issues: list[str] = []
        question_kz = ' '.join(kz_parts).strip()
        question_ru = ' '.join(ru_parts).strip()
        answer = ' '.join(answer_parts).strip().rstrip('.')

        if not question_kz:
            issues.append("Missing [ҚАЗАҚША] question text")
        if not question_ru:
            issues.append("Missing [РУССКИЙ] question text")
        if not answer:
            issues.append("Missing [ОТВЕТ] answer")

        item: ParsedPod = {
            'number': current_num,
            'question_kz': question_kz,
            'question_ru': question_ru,
            'answer': answer,
            'images': list(images),
        }
        if issues:
            errors.append({'number': current_num, 'issues': issues})
        else:
            parsed.append(item)

        kz_parts.clear()
        ru_parts.clear()
        answer_parts.clear()
        images.clear()
        current_num = None
        current_field = None

    for para in doc.paragraphs:
        para_imgs = _para_images(para, doc)
        text = para.text.strip()

        num_m = _ZADACHA_RE.match(text)
        if num_m:
            flush()
            current_num = int(num_m.group(1))
            current_field = None
            continue

        tag_m = _TAG_RE.match(text)
        if tag_m:
            tag = tag_m.group(1).strip().upper()
            if tag in _KZ_TAGS:
                current_field = 'kz'
            elif tag in _RU_TAGS:
                current_field = 'ru'
            elif tag in _IMAGE_TAGS:
                current_field = 'image'
            elif tag in _ANSWER_TAGS:
                current_field = 'answer'
            continue

        if not text:
            if para_imgs and current_num is not None:
                images.extend(para_imgs)
            continue

        if current_field == 'kz':
            kz_parts.append(text)
        elif current_field == 'ru':
            ru_parts.append(text)
        elif current_field == 'answer':
            answer_parts.append(text)
        # 'image' field: no text expected, only the embedded picture below

        if para_imgs and current_num is not None:
            images.extend(para_imgs)

    flush()
    return parsed, errors
