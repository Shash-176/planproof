# 07 — Community and judge strategy (reassessment after submission)

Written 10 November 2026, after the Round 1 entry was submitted. This re-scores PlanProof against
the three judging inputs published on bharatcode.ai/hackathon: **GitHub stars**, **website votes**
(one per registered account, changeable) and **judges' evaluation**. Weights are not published.

All scores are the author's judgement on a 1–5 scale. They are not measurements.

## 1. Re-scoring under the real judging structure

| Project | Judges | Website votes | GitHub stars | Demo reliability |
|---|---|---|---|---|
| **PlanProof** | 5 | 3 | 4 | 5 |
| Accessibility audit agent | 4 | 4 | 4 | 3 |
| Hospital bill auditor | 3 | 3 | 2 | 3 |
| Handwritten-solution misconception finder | 3 | 4 | 2 | 3 |
| Docs drift tester | 4 | 2 | 3 | 3 |

### Where PlanProof is weak
- **Website votes.** "Postgres query optimiser" loses anyone who is not a backend developer within
  ten seconds. The accessibility agent ("enter any URL") is easier to grasp and more visual.
- **Accessibility beyond Postgres experts.** Reading a query plan is a specialist skill.
- **Ten-second value.** The original framing ("optimiser") invites comparison with funded tools
  and does not say why anyone should care.

### Why it still wins overall
- **Demo reliability matters most while voting dates are unknown.** PlanProof runs in the visitor's
  browser. The accessibility agent needs a hosted headless browser and depends on screenshot reading
  by a 27B model that has not been tested.
- **GitHub stars come from developers.** A developer tool with a clear technical idea earns stars more
  readily than a consumer tool.
- **Judges.** The deterministic verification harness is the strongest engineering story on the list.

### When to switch instead
If organisers reveal that votes dominate the weighting, or if the builder's strength is front-end
rather than databases, the accessibility audit agent becomes the better choice.

## 2. Decision: APPROVE, with repositioning

PlanProof stays, but only with the four changes below. Without them the vote and star scores above
are optimistic.

### Change 1 — Reframe as a fact-checker for AI SQL advice
> **"Your AI suggested a SQL optimisation. Did it actually help? PlanProof proves it."**

Everyone who uses ChatGPT, Copilot or Cursor has received a confident index or rewrite suggestion.
Very few tools check it. This framing makes the incumbents (Aiven/EverSQL, pganalyze) adjacent rather
than direct competitors, because PlanProof judges *any* AI's advice, including its own.

### Change 2 — "Paste what your AI suggested" is a core workflow
The user pastes the suggestion they already have — SQL, or prose copied from a chat — and PlanProof
returns **VERIFIED**, **INEFFECTIVE** or **UNSAFE** with evidence. It works even if the BharatCode
model is unavailable for pasted SQL, because verification never depends on the model.

### Change 3 — The first 20 seconds need no typing
One click runs a bundled example: "AI told me to add this index." The result shows a before/after
plan and a plain number such as rows read before and after, with "results identical".
No account, no install.

### Change 4 — Built-in reasons to share
- Plain-English plan explanation, so non-experts understand what changed (core, not optional)
- A gallery of plausible AI suggestions that did nothing or silently changed results
- Later (P1): a proof card with its own link and preview image, and a README GIF at the top

## 3. Rules for community growth

- No vote or star manipulation, no star-for-star exchanges, no asking for votes from accounts
  created for that purpose.
- Every public claim must be reproducible from the repo. Benchmarks are published only after
  they are measured, with the command that produced them.
- Share the repo where its users are (developer communities), with the honest status of the build.

## 4. What judges should be able to see in the repo

1. A clear statement of the trust model: the model proposes, the database decides.
2. A verification harness with adversarial tests (destructive SQL, NULLs, duplicates, ordering,
   empty tables, malformed model output, API failure).
3. Real BharatCode API integration with retries, timeouts and schema validation.
4. Honest limitations: synthetic data is not production data; equal results on test data is
   evidence, not a proof.
