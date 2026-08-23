# -*- coding: utf-8 -*-
"""
Targeted content revision for two subtopics (not the full-catalogue
revise_content.py sweep):
  - "Теңдеулер"/"Уравнения" (Equations): full A/B/C problem replacement
    (harder — was one-step trivial equations at level A) + one new lesson
    section on equations with fractions.
  - "Теңсіздіктер"/"Неравенства" (Inequalities): level-A problems only
    (same escalation from one-step to two-step; B/C left as they were).

Source data: equations_kz.json / equations_ru.json /
inequalities_a_kz.json / inequalities_a_ru.json, produced by
scratchpad/equations_inequalities/gen.py (every answer verified there by
substitution before being written out).

Run against local first, verify, then production (same pattern as every
other content script this session).
"""
import json
import os

from app.database import SessionLocal
from app.models import SubTopic, Lesson, Problem

DATA_DIR = r"C:\Users\Aruay\AppData\Local\Temp\claude\c--Users-Aruay-Desktop-eduapp-web\e30c8997-15e3-44e3-9bf1-080a0ec2a20b\scratchpad\equations_inequalities"

FRACTION_SECTION = {
    "kz": [
        {"type": "heading", "level": 2, "content": "Теңдеуде бөлшек болғанда"},
        {"type": "text", "content": (
            r"Теңдеуде $\dfrac{x}{a}$ түріндегі бөлшектер кездессе, ең ыңғайлысы — теңдеудің "
            r"екі жағын да бөлімдердің [[blue:ең кіші ортақ еселігіне]] көбейтіп, бөлшектерден "
            r"құтылу. **Мысал:** $\dfrac{x}{2} + \dfrac{x}{3} = 10$. Бөлімдер 2 мен 3, олардың "
            r"ең кіші ортақ еселігі — 6. Теңдеудің екі жағын да 6-ға көбейтеміз: "
            r"$6 \cdot \dfrac{x}{2} + 6 \cdot \dfrac{x}{3} = 6 \cdot 10$, яғни $3x + 2x = 60$, "
            r"бұдан $5x = 60$, $x = 12$. Бұдан кейін теңдеу әдеттегідей бүтін коэффициентті "
            r"теңдеуге айналады."
        )},
    ],
    "ru": [
        {"type": "heading", "level": 2, "content": "Уравнения с дробями"},
        {"type": "text", "content": (
            r"Если в уравнении встречаются дроби вида $\dfrac{x}{a}$, удобнее всего умножить "
            r"обе части уравнения на [[blue:наименьшее общее кратное]] знаменателей — тогда "
            r"дроби исчезают. **Пример:** $\dfrac{x}{2} + \dfrac{x}{3} = 10$. Знаменатели 2 и 3, "
            r"их наименьшее общее кратное — 6. Умножаем обе части на 6: "
            r"$6 \cdot \dfrac{x}{2} + 6 \cdot \dfrac{x}{3} = 6 \cdot 10$, то есть $3x + 2x = 60$, "
            r"откуда $5x = 60$, $x = 12$. После этого уравнение становится обычным уравнением "
            r"с целыми коэффициентами."
        )},
    ],
}


def load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


def apply_problems(db, lesson, problems, replace_levels):
    """Delete existing problems at the given levels for this lesson, insert
    the new set in order (order_index continues from whatever's left, so
    levels not being replaced keep their relative position)."""
    existing = db.query(Problem).filter(Problem.subsubtopic_id == lesson.id).all()
    keep = [p for p in existing if p.level not in replace_levels]
    for p in existing:
        if p.level in replace_levels:
            db.delete(p)
    db.flush()

    next_order = (max((p.order_index for p in keep), default=-1)) + 1
    for i, item in enumerate(problems):
        db.add(Problem(
            subsubtopic_id=lesson.id,
            question=item["question"],
            problem_type=item["problem_type"],
            options=item["options"],
            correct_option=(item["correct_options"][0] if item["correct_options"] else 0),
            correct_options=item["correct_options"],
            open_answer=item["open_answer"],
            level=item["level"],
            order_index=next_order + i,
            is_draft=False,
            is_published=True,
        ))


def main():
    db = SessionLocal()

    eq_kz, eq_ru = load("equations_kz.json"), load("equations_ru.json")
    ineq_a_kz, ineq_a_ru = load("inequalities_a_kz.json"), load("inequalities_a_ru.json")

    for lang, eq_data, ineq_data in (("kz", eq_kz, ineq_a_kz), ("ru", eq_ru, ineq_a_ru)):
        eq_title = "Теңдеулер" if lang == "kz" else "Уравнения"
        ineq_title = "Теңсіздіктер" if lang == "kz" else "Неравенства"

        eq_sub = db.query(SubTopic).filter(SubTopic.language == lang, SubTopic.title == eq_title).first()
        assert eq_sub, f"Equations subtopic not found for {lang}"
        eq_lesson = db.query(Lesson).filter(Lesson.subtopic_id == eq_sub.id).first()
        assert eq_lesson, f"Equations lesson not found for {lang}"

        apply_problems(db, eq_lesson, eq_data, replace_levels={"A", "B", "C"})

        # Insert the fraction-equations section right after "opening brackets"
        # (index 10 in both languages — verified by inspection) and before
        # "building an equation from a word problem" (index 11).
        blocks = list(eq_lesson.content_blocks or [])
        insert_at = 11 if len(blocks) >= 11 else len(blocks)
        already_has = any("бөлшек" in (b.get("content") or "").lower() or "дроб" in (b.get("content") or "").lower()
                           for b in blocks if b["type"] == "heading")
        if not already_has:
            blocks = blocks[:insert_at] + FRACTION_SECTION[lang] + blocks[insert_at:]
            eq_lesson.content_blocks = blocks

        ineq_sub = db.query(SubTopic).filter(SubTopic.language == lang, SubTopic.title == ineq_title).first()
        assert ineq_sub, f"Inequalities subtopic not found for {lang}"
        ineq_lesson = db.query(Lesson).filter(Lesson.subtopic_id == ineq_sub.id).first()
        assert ineq_lesson, f"Inequalities lesson not found for {lang}"

        apply_problems(db, ineq_lesson, ineq_data, replace_levels={"A"})

        print(f"[{lang}] Equations: replaced 30 problems (A/B/C) + fraction section "
              f"({'added' if not already_has else 'already present'}). "
              f"Inequalities: replaced 10 level-A problems.")

    db.commit()
    print("Committed.")
    db.close()


if __name__ == "__main__":
    main()
