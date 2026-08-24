# -*- coding: utf-8 -*-
"""
Converts every after-lesson-test Open problem whose answer is a negative
integer into an MCQ (both language sides of the pair), so Open questions are
left with only non-negative integer answers as required.

Distractor scheme: {correct, -correct (sign-flip — the single most common
real mistake for a negative result: forgetting to negate), correct-1,
correct+1 (off-by-one / boundary slip — especially natural for "smallest/
largest integer solution" inequality problems)}. Always 4 distinct values
for a negative integer correct answer (proven: -correct is positive hence
never equal to correct±1, and correct-1 != correct+1). A few absolute-value
"find the smaller/larger root" problems get a sharper distractor instead —
the equation's OTHER root — since that's an even more natural mistake than
a generic sign-flip for those specifically.

Both language sides of a pair get IDENTICAL numeric options (the option
text is just numbers here, nothing to translate) and the SAME correct
index, so admin/QA views stay visually consistent across languages.
Correct-option index is cycled 0,1,2,3 across pairs to avoid clustering.

Run against local first, verify, then production.
"""
from app.database import SessionLocal
from app.models import Problem

# question substring -> explicit 3-distractor list, for the two absolute-
# value "find the smaller/larger root" problems where the equation's actual
# OTHER root is a sharper distractor than a generic one. (A third such
# problem, |x|=18, doesn't need an override: its other root, 18, is already
# exactly the generic sign-flip distractor.)
EXPLICIT_DISTRACTORS = {
    "|x + 10| = 3": [-13, 7, -8],   # roots are -7 (correct, larger) and -13 (other/smaller root)
    "3|x + 4| - 6 = 9": [1, 9, -10],  # roots are -9 (correct, smaller) and 1 (other/larger root)
}


def distractors_for(question: str, correct: int) -> list[int]:
    for substr, explicit in EXPLICIT_DISTRACTORS.items():
        if substr in question:
            assert correct not in explicit and len(set(explicit)) == 3
            return explicit
    return [-correct, correct - 1, correct + 1]


def main():
    db = SessionLocal()
    rows = db.query(Problem).filter(Problem.problem_type == "open").all()
    neg = [p for p in rows if p.open_answer and isinstance(p.open_answer.get("value"), (int, float))
           and p.open_answer.get("value") < 0]

    unpaired = [p for p in neg if not p.pair_key]
    assert not unpaired, f"{len(unpaired)} negative-answer open problems have no pair_key — investigate before proceeding"

    by_pair: dict = {}
    for p in neg:
        by_pair.setdefault(p.pair_key, []).append(p)

    converted = 0
    idx_cycle = 0
    idx_distribution: dict = {0: 0, 1: 0, 2: 0, 3: 0}

    for pair_key, members in by_pair.items():
        if len(members) == 1:
            # The sibling isn't in the "negative open" set — check whether
            # it's because it was already converted to mcq independently
            # (production had one such pre-existing case) rather than a
            # genuine pairing gap.
            sibling = (
                db.query(Problem)
                .filter(Problem.pair_key == pair_key, Problem.id != members[0].id)
                .first()
            )
            correct = int(members[0].open_answer["value"])
            if sibling and sibling.problem_type == "mcq" and sibling.correct_options:
                sib_correct_val = sibling.options[sibling.correct_options[0]]
                assert int(sib_correct_val) == correct, (
                    f"pair {pair_key}: sibling mcq's correct option ({sib_correct_val}) "
                    f"doesn't match this side's open answer ({correct})"
                )
                # Mirror the sibling's existing (already-published) option
                # structure onto this side instead of inventing a new one,
                # so both languages show the identical option set.
                members[0].problem_type = "mcq"
                members[0].options = list(sibling.options)
                members[0].correct_option = sibling.correct_option
                members[0].correct_options = list(sibling.correct_options)
                members[0].open_answer = None
                converted += 1
                continue
            raise AssertionError(f"pair {pair_key} has no usable sibling to pair with: {members[0].question!r}")

        assert len(members) == 2, f"pair {pair_key} has {len(members)} members, expected 1 or 2"

        # All members of a pair share one answer/options structure.
        correct = int(members[0].open_answer["value"])
        dists = distractors_for(members[0].question, correct)
        assert len(set([correct] + dists)) == 4, f"non-distinct options for pair {pair_key}: {[correct]+dists}"

        target_idx = idx_cycle % 4
        idx_cycle += 1
        idx_distribution[target_idx] += 1

        options_int = dists[:]
        options_int.insert(target_idx, correct)
        options = [str(v) for v in options_int]

        for p in members:
            assert p.open_answer["value"] == correct, f"pair {pair_key} language mismatch in answer value"
            p.problem_type = "mcq"
            p.options = options
            p.correct_option = target_idx
            p.correct_options = [target_idx]
            p.open_answer = None
            converted += 1

    db.commit()
    print(f"Converted {converted} rows ({len(by_pair)} pairs) from open to mcq.")
    print("Correct-index distribution:", idx_distribution)
    db.close()


if __name__ == "__main__":
    main()
