"""
Parse a .docx file as a lesson, producing content_blocks with headings, text, formulas, and images.

Images are returned as (bytes, content_type) pairs; the caller uploads them to R2 and
replaces the '__img_N__' placeholder URLs before saving the lesson.
"""
from __future__ import annotations
import io
from docx import Document
from docx.oxml.ns import qn


def _para_images(para, doc) -> list[tuple[bytes, str]]:
    imgs = []
    for blip in para._element.iter(qn('a:blip')):
        r_id = blip.get(qn('r:embed'))
        if r_id and r_id in doc.part.related_parts:
            part = doc.part.related_parts[r_id]
            imgs.append((part.blob, part.content_type or 'image/png'))
    return imgs


def _heading_level(para) -> int | None:
    try:
        name = (para.style.name or '').lower()
    except Exception:
        return None
    if 'heading 1' in name or name == 'title':
        return 1
    if 'heading 2' in name:
        return 2
    if 'heading 3' in name or 'heading 4' in name:
        return 3
    return None


def parse_docx_lesson(content: bytes) -> tuple[list[dict], list[tuple[bytes, str]]]:
    """
    Returns:
        blocks     — list of content block dicts (heading/text/formula/image)
        raw_images — (bytes, content_type) list; 'image' blocks use '__img_N__' placeholder URLs
    """
    doc = Document(io.BytesIO(content))
    blocks: list[dict] = []
    raw_images: list[tuple[bytes, str]] = []

    for para in doc.paragraphs:
        # Images in this paragraph (may coexist with text for inline images)
        para_imgs = _para_images(para, doc)
        for img_bytes, ctype in para_imgs:
            idx = len(raw_images)
            raw_images.append((img_bytes, ctype))
            blocks.append({'type': 'image', 'url': f'__img_{idx}__', 'caption': ''})

        text = para.text.strip()
        if not text:
            continue

        level = _heading_level(para)
        if level is not None:
            blocks.append({'type': 'heading', 'level': level, 'content': text})
            continue

        # Paragraph that is purely a display formula: $$...$$
        if text.startswith('$$') and text.endswith('$$') and text.count('$$') == 2:
            blocks.append({'type': 'formula', 'latex': text[2:-2].strip()})
            continue

        blocks.append({'type': 'text', 'content': text})

    return blocks, raw_images
