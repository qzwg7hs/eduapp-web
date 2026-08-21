"""
Parse a .docx problem-set file using the bracketed-tag format.

Expected paragraph sequence (repeating blocks):
    Уровень X (subtitle)        <- section header; updates current level
    [ЗАДАЧА N]                  <- starts a new problem
    [ОПИСАНИЕ]
    <question text, may span multiple paragraphs, may contain $...$ / $$...$$ LaTeX>
    [ИЗОБРАЖЕНИЕ]               <- optional; image blobs attached here are extracted
    [ТИП ОТВЕТА]
    <"Одно число" | "Набор чисел" | "Несколько полей" | "Тест с вариантами">
    [ВАРИАНТЫ ОТВЕТА]           <- MCQ options, one per line; empty for other types
    [ОТВЕТ]
    <answer content — shape depends on ТИП ОТВЕТА>

Empty paragraphs are skipped throughout.

Level headers appear between the last problem of one level and the first of the next,
so the level is snapshotted when [ЗАДАЧА N] is first seen rather than at flush time.

Answer shapes stored in the 'answer' field:
    Одно число      -> {"type": "single", "value": "<str>"}
    Набор чисел     -> {"type": "set",    "values": ["v1", "v2", ...]}
    Несколько полей -> {"type": "multi_field", "fields": [
                          {"label": "...", "field_type": "single", "value": "..."},
                          {"label": "...", "field_type": "set",    "values": [...]},
                       ]}
    Тест с вариантами -> {"type": "mcq", "options": [{"key":"A","text":"..."},...],
                          "correct": "B"}  # UNTESTED — no MCQ sample data
"""

from __future__ import annotations
import io
import re
from typing import Any

from docx import Document
from docx.oxml.ns import qn

ParsedProblem = dict[str, Any]
ParseError    = dict[str, Any]

KNOWN_TYPES = {"Одно число", "Набор чисел", "Несколько полей", "Тест с вариантами"}

_TAG_RE     = re.compile(r'^\[(.+?)\]\s*$')
_ZADACHA_RE = re.compile(r'^\[ЗАДАЧА\s+(\d+)\]\s*$')
_LEVEL_RE   = re.compile(r'^Уровень\s+(\S+)\s*[\(（](.+?)[\)）]\s*$')


def _para_images(para, doc) -> list[tuple[bytes, str]]:
    imgs = []
    for blip in para._element.iter(qn('a:blip')):
        r_id = blip.get(qn('r:embed'))
        if r_id and r_id in doc.part.related_parts:
            part = doc.part.related_parts[r_id]
            imgs.append((part.blob, part.content_type or 'image/png'))
    return imgs


def _parse_tag(text: str) -> str | None:
    m = _TAG_RE.match(text.strip())
    return m.group(1).strip() if m else None


def _parse_zadacha_num(text: str) -> int | None:
    m = _ZADACHA_RE.match(text.strip())
    return int(m.group(1)) if m else None


def _parse_level(text: str) -> tuple[str | None, str | None]:
    m = _LEVEL_RE.match(text.strip())
    if m:
        return f"Уровень {m.group(1)}", m.group(2).strip()
    return None, None


def _split_values(raw: str) -> list[str]:
    """Split a comma-separated answer string, stripping whitespace and trailing periods."""
    return [v.strip().rstrip('.') for v in raw.split(',') if v.strip().rstrip('.')]


def _parse_multi_field_line(line: str) -> tuple[dict | None, str | None]:
    """
    Parse one answer line for Несколько полей.
    Preferred: "Label | field_type | value(s)"
    Legacy:    "Label: value1, value2, ..."
    """
    line = line.strip()
    if '|' in line:
        parts = [p.strip() for p in line.split('|')]
        if len(parts) != 3:
            return None, f"Expected 3 pipe-separated parts, got {len(parts)}: {line!r}"
        label, ft_raw, val_raw = parts
        ft = ft_raw.lower().strip()
        if ft == 'одно число':
            return {"label": label, "field_type": "single",
                    "value": val_raw.strip().rstrip('.')}, None
        elif ft == 'набор чисел':
            return {"label": label, "field_type": "set",
                    "values": _split_values(val_raw)}, None
        else:
            return None, f"Unknown field_type {ft!r} in pipe-format line"
    elif ':' in line:
        # Legacy colon format: "Label: v1, v2, ..."
        label, _, val_raw = line.partition(':')
        vals = _split_values(val_raw)
        if len(vals) == 1:
            return {"label": label.strip(), "field_type": "single", "value": vals[0]}, None
        return {"label": label.strip(), "field_type": "set", "values": vals}, None
    else:
        return None, f"Cannot parse multi-field line (no '|' or ':'): {line!r}"


def _build_answer(
    answer_type: str | None,
    answer_parts: list[str],
    options_parts: list[str],
    issues: list[str],
) -> dict | None:
    at  = (answer_type or '').strip()
    raw = ' '.join(answer_parts).strip().rstrip('.')

    if at == 'Одно число':
        if not raw:
            issues.append("ОТВЕТ is empty for type 'Одно число'")
            return None
        return {"type": "single", "value": raw}

    elif at == 'Набор чисел':
        if not raw:
            issues.append("ОТВЕТ is empty for type 'Набор чисел'")
            return None
        return {"type": "set", "values": _split_values(raw)}

    elif at == 'Несколько полей':
        if not answer_parts:
            issues.append("ОТВЕТ has no lines for type 'Несколько полей'")
            return None
        fields = []
        for line in answer_parts:
            field, err = _parse_multi_field_line(line)
            if err:
                issues.append(f"multi_field parse error: {err}")
            elif field:
                fields.append(field)
        return {"type": "multi_field", "fields": fields}

    elif at == 'Тест с вариантами':
        # UNTESTED — no MCQ data in sample files
        if not options_parts:
            issues.append("'Тест с вариантами' has no [ВАРИАНТЫ ОТВЕТА] lines")
            return None
        opts = []
        for line in options_parts:
            m = re.match(r'^([A-ДA-Z])\)\s*(.*)', line.strip())
            if m:
                opts.append({"key": m.group(1), "text": m.group(2).strip()})
            else:
                issues.append(f"Cannot parse MCQ option: {line!r}")
        if not raw:
            issues.append("'Тест с вариантами' has empty ОТВЕТ")
        return {"type": "mcq", "options": opts, "correct": raw or None}

    else:
        issues.append(f"Unrecognized ТИП ОТВЕТА: {at!r}")
        return None


def parse_test_docx(content: bytes) -> tuple[list[ParsedProblem], list[ParseError]]:
    """
    Parse a bracketed-tag .docx problem set.

    Returns:
        parsed  – list of problems with status "ok"; each has keys:
                  level, number, question, answer_type, answer, answer_text, images
        errors  – list of {number, issues, problem} for problems that need review
    """
    doc = Document(io.BytesIO(content))

    current_level: str | None = None
    problem_level: str | None = None   # snapshotted at [ЗАДАЧА N]
    current_num:   int | None = None
    current_field: str | None = None

    desc_parts:    list[str]               = []
    options_parts: list[str]               = []
    answer_parts:  list[str]               = []
    hint_parts:    list[str]               = []
    answer_type:   str | None              = None
    images:        list[tuple[bytes, str]] = []

    parsed: list[ParsedProblem] = []
    errors: list[ParseError]    = []

    def flush() -> None:
        nonlocal current_num, current_field, answer_type

        if current_num is None:
            return

        issues: list[str] = []

        description = ' '.join(desc_parts).strip()
        if not description:
            issues.append("ОПИСАНИЕ is empty")

        at = (answer_type or '').strip()
        if at not in KNOWN_TYPES:
            issues.append(f"Unrecognized ТИП ОТВЕТА: {at!r}")

        answer = _build_answer(answer_type, answer_parts, options_parts, issues)
        raw_answer_text = ' '.join(answer_parts).strip().rstrip('.')

        prob: ParsedProblem = {
            'level':       problem_level,
            'number':      current_num,
            'question':    description,
            'answer_type': at,
            'answer':      answer,
            'answer_text': raw_answer_text,
            'images':      list(images),
            'hint':        ' '.join(hint_parts).strip(),
            'status':      'ok' if not issues else 'needs_review',
            'issues':      issues,
        }

        if issues:
            errors.append({'number': current_num, 'issues': issues, 'problem': prob})
        else:
            parsed.append(prob)

        desc_parts.clear()
        options_parts.clear()
        answer_parts.clear()
        hint_parts.clear()
        images.clear()
        answer_type    = None
        current_num    = None
        current_field  = None

    for para in doc.paragraphs:
        para_imgs = _para_images(para, doc)
        text = para.text

        lv_label, _ = _parse_level(text.strip())
        if lv_label:
            current_level = lv_label
            continue

        num = _parse_zadacha_num(text.strip())
        if num is not None:
            flush()
            current_num   = num
            problem_level = current_level
            current_field = None
            continue

        tag = _parse_tag(text.strip())
        if tag is not None:
            if tag == 'ОПИСАНИЕ':
                current_field = 'description'
            elif tag == 'ИЗОБРАЖЕНИЕ':
                current_field = 'image'
            elif tag == 'ТИП ОТВЕТА':
                current_field = 'type'
            elif tag == 'ВАРИАНТЫ ОТВЕТА':
                current_field = 'options'
            elif tag == 'ОТВЕТ':
                current_field = 'answer'
            elif tag == 'ПОДСКАЗКА':
                current_field = 'hint'
            continue

        stripped = text.strip()
        if not stripped:
            # Images can live in paragraphs with no text; collect them before skipping
            if para_imgs and current_num is not None and current_field in ('image', 'description'):
                images.extend(para_imgs)
            continue

        if current_field == 'description':
            desc_parts.append(stripped)
            if para_imgs:
                images.extend(para_imgs)
        elif current_field == 'image':
            if para_imgs:
                images.extend(para_imgs)
        elif current_field == 'type':
            answer_type   = stripped
            current_field = None
        elif current_field == 'options':
            options_parts.append(stripped)
        elif current_field == 'answer':
            answer_parts.append(stripped)
        elif current_field == 'hint':
            hint_parts.append(stripped)

    flush()
    return parsed, errors
