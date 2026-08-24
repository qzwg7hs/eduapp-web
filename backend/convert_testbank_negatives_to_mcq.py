# -*- coding: utf-8 -*-
"""
Converts every Test Bank Open problem whose answer is a negative integer
into an MCQ (both kz and ru rows sharing the same `number`), same treatment
already applied to the after-lesson tests.

Distractors are computed per problem below — several have a genuinely
computable "common mistake" value that's a much sharper distractor than a
generic one (ignoring the brackets, forgetting to distribute a negative
sign, mixing up which function is squared vs cubed, forgetting the /2 in a
midpoint formula); everything else uses the same {sign-flip, correct-1,
correct+1} default used for the after-lesson-test conversion. Every value
is computed/verified in this file, not by hand. Options are identical text
in both languages (pure numbers), correct index cycled 0-3 to avoid
clustering.

Run against local, verify, then production (local's real content lives on
production only for the Test Bank — verify counts before assuming there's
anything to do locally).
"""
from app.database import SessionLocal
from app.models import TestBankProblem

# number -> exactly 3 distractor ints (order = as given; correct gets
# inserted at the cycled target index by the driver below).
DISTRACTORS: dict[int, list[int]] = {
    111: [5, -6, -4],                 # equation, generic
    146: [-10, 13, -14],              # midpoint: -10 = forgot the "x2" (computed S=V-Q instead of 2V-Q)
    222: [6, -7, -5],                 # equation, generic
    224: [3, -4, -2],                 # equation, generic
    226: [1, -2, 0],                  # equation, generic
    1455: [7, -8, -6],                # chart reading, generic
    1460: [5, -6, -4],                # chart reading, generic
    2721: [20, -9, 11],               # 20 = T-A (reversed order), -9 = A alone, 11 = T alone
    2724: [16, 17, 33],               # same pattern
    2727: [14, 19, 33],               # same pattern
    2894: [3, -4, -2],                # table pattern, generic (sign-flip = A-B instead of B-A)
    2897: [8, -9, -7],                # table pattern, generic
    3183: [-306, 150, -151],          # -306 = forgot to distribute the minus on the 2nd bracket
    3185: [-228, 300, -299],
    3188: [-9, 39, -38],
    3189: [213, 87, -88],
    3612: [0, 198, -199],             # 0 = swapped which function is squared vs cubed
    3613: [338, 4, -5],
    3615: [330, 64, -65],
    3616: [118, 30, -31],
    3617: [320, 154, -155],
    3619: [718, 30, -31],
    3620: [62, 4, -5],
}


def verify_tailored_values():
    """Re-derive the tailored (non-generic) distractors from the actual
    problem mechanics, so they're checked here rather than trusted by eye."""
    # #146: S = 2V - Q (midpoint formula), "forgot the x2" mistake = V - Q
    Q, V = (1, 6), (-2, -1)
    S = (2 * V[0] - Q[0], 2 * V[1] - Q[1])
    assert S[0] + S[1] == -13
    forgot_double = (V[0] - Q[0]) + (V[1] - Q[1])
    assert forgot_double == -10

    # #2721/2724/2727: A = correct bracketed value, T = ignoring brackets
    for total, a_paren, b_paren, expected in [(15, 14, 10, -20), (38, 13, 8, -16), (35, 9, 7, -14)]:
        A = total - (a_paren + b_paren)
        T = total - a_paren + b_paren
        assert A - T == expected
        assert DISTRACTORS[{-20: 2721, -16: 2724, -14: 2727}[expected]] == [T - A, A, T]

    # #3183/3185/3188/3189: correct vs "forgot to negate 2nd bracket" (+ instead of -)
    cases = [
        (3183, -6, 2, 6, 7, 2, 3, 2, -7, -150, -306),
        (3185, -4, -4, 6, 7, 4, 3, 4, -7, -300, -228),
        (3188, 0, -1, 6, 5, 4, 3, 4, -5, -39, -9),
        (3189, 5, -1, 3, 5, 4, 6, 4, -5, -87, 213),
    ]
    for num, x, y, c1, a1, b1, c2, a2, b2, expected, expected_slip in cases:
        term1 = a1 * x + b1 * y
        term2 = a2 * x + b2 * y
        correct = c1 * term1 - c2 * term2
        slip = c1 * term1 + c2 * term2
        assert correct == expected, (num, correct, expected)
        assert slip == expected_slip, (num, slip, expected_slip)
        assert DISTRACTORS[num][0] == expected_slip

    # #3612 etc: correct = p^2+p-q^3+q ; "swap" mistake = p^3+p-q^2+q
    for num, p, q, expected in [
        (3612, 3, 6, -198), (3613, 7, 4, -4), (3615, 7, 5, -64),
        (3616, 5, 4, -30), (3617, 7, 6, -154), (3619, 9, 5, -30), (3620, 4, 3, -4),
    ]:
        correct = p**2 + p - q**3 + q
        swap = p**3 + p - q**2 + q
        assert correct == expected, (num, correct, expected)
        assert DISTRACTORS[num][0] == swap, (num, DISTRACTORS[num][0], swap)


def main():
    verify_tailored_values()

    db = SessionLocal()
    rows = db.query(TestBankProblem).filter(TestBankProblem.problem_type == "open").all()
    neg = [p for p in rows
           if isinstance(p.open_answer.get("value"), int) and not isinstance(p.open_answer.get("value"), bool)
           and p.open_answer["value"] < 0]

    by_num: dict = {}
    for p in neg:
        by_num.setdefault(p.number, {})[p.language] = p

    missing = {n for n in DISTRACTORS if n not in by_num}
    assert not missing, f"expected numbers not found in DB: {missing}"
    extra = set(by_num) - set(DISTRACTORS)
    assert not extra, f"found negative-answer numbers with no distractor set defined: {extra}"

    converted = 0
    idx_cycle = 0
    idx_distribution = {0: 0, 1: 0, 2: 0, 3: 0}

    for num, d in sorted(by_num.items()):
        kz, ru = d.get("kz"), d.get("ru")
        assert kz and ru, f"#{num}: missing a language side"
        correct = kz.open_answer["value"]
        assert ru.open_answer["value"] == correct, f"#{num}: kz/ru answer mismatch"

        dists = DISTRACTORS[num]
        assert len(set([correct] + dists)) == 4, f"#{num}: non-distinct options {[correct]+dists}"

        target_idx = idx_cycle % 4
        idx_cycle += 1
        idx_distribution[target_idx] += 1

        options_int = dists[:]
        options_int.insert(target_idx, correct)
        options = [str(v) for v in options_int]

        for p in (kz, ru):
            p.problem_type = "mcq"
            p.options = options
            p.correct_option = target_idx
            p.correct_options = [target_idx]
            p.open_answer = None
            converted += 1

    db.commit()
    print(f"Converted {converted} rows ({len(by_num)} pairs) from open to mcq.")
    print("Correct-index distribution:", idx_distribution)
    db.close()


if __name__ == "__main__":
    main()
