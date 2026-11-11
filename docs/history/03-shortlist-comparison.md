# 03 — Shortlist of eight and comparison

Scores are the author's judgement on a 1–5 scale, not measurements. Weights reflect the stated
goal (an SDE internship application) and the published judging inputs (stars, votes, judges).

| Criterion | Weight | Why |
|---|---|---|
| Real-world usefulness | 20% | Judges and voters must see a real problem |
| Originality | 15% | Versus products and versus other entrants |
| Engineering depth | 20% | The SDE signal |
| Feasibility | 20% | Deadline is immediate; solo build; 27B model |
| Meaningful API usage | 10% | Tool calling, structured output, vision — not a chat wrapper |
| Demonstration quality | 15% | Votes and stars need a zero-setup, legible demo |

## Scores

| # | Project | Use | Orig | Depth | Feas | API | Demo | **Weighted** |
|---|---|---|---|---|---|---|---|---|
| 17 | Postgres query optimiser with proof by execution | 4 | 3 | 5 | 4 | 4 | 5 | **4.20** |
| 24 | Accessibility audit agent | 5 | 3 | 4 | 3 | 5 | 4 | **3.95** |
| 13 | Hospital bill auditor | 5 | 4 | 3 | 2 | 4 | 4 | **3.60** |
| 7 | Docs drift tester | 4 | 4 | 4 | 3 | 3 | 3 | **3.55** |
| 4 | Handwritten-solution misconception finder | 4 | 3 | 3 | 3 | 4 | 4 | **3.45** |
| 1 | Claim-level citation verifier | 4 | 3 | 3 | 3 | 4 | 3 | **3.30** |
| 10 | GST invoice reconciler | 4 | 2 | 3 | 3 | 4 | 3 | **3.15** |
| 22 | Maintainer triage bot | 3 | 2 | 4 | 3 | 3 | 2 | **2.90** |

## Reasoning per project

**#17 Query optimiser (4.20).** The model proposes; a real Postgres decides. That makes a weak
model safe to use and gives the demo a number ("cost 48,210 → 312, results identical"). Runs
entirely in the browser, so hosting is one small serverless function. Weakness: the category has
funded incumbents, and sandbox timings are not production timings.

**#24 Accessibility agent (3.95).** Highest social value and the best use of image input. Loses on
feasibility: it needs a hosted headless browser (heavier, slower, costlier to run free), and it
depends on how well a 27B model reads screenshots, which is untested.

**#13 Hospital bill auditor (3.60).** The most emotionally compelling idea. Feasibility is 2
because it stands or falls on a clean reference-price dataset that would have to be assembled and
verified, and wrong output could mislead someone in a stressful situation.

**#7 Docs drift tester (3.55).** Original and useful to maintainers. Arbitrary-code sandboxing for
many languages is a large scope; the demo is a list of broken snippets, which is less striking.

**#4 Misconception finder (3.45).** Good vision use and a clear student audience, but education is
the most crowded category in this hackathon and handwriting accuracy is a risk that cannot be
checked deterministically.

**#1 Citation verifier (3.30).** Useful, but source fetching (paywalls, PDFs with no file input)
erodes reliability, and incumbents are well known.

**#10 GST reconciler (3.15).** Real pain, but incumbents are entrenched and the result looks like a
feature of existing accounting software.

**#22 Triage bot (2.90).** Honest engineering, weak demo, no embeddings for de-duplication.

## Sensitivity check

- If **demo and usefulness** are weighted up and feasibility down, #24 and #13 close the gap but #17
  stays first or tied, because its demo score is also 5.
- If the 27B model's **vision is strong**, #24 improves to roughly 4.15 and becomes a legitimate
  alternative. This is the one finding that could change the recommendation.
- If the builder has **no SQL/database background**, #17's feasibility falls to 3 (4.00), still first
  but narrowly. Say so before approval if this applies.
