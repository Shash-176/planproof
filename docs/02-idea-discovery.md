# 02 — Idea discovery: 25 ideas across the eight categories

Researched 10 November 2026. Competitor names marked † were confirmed by a web search this session
(result titles only, pages not read in depth). All other competitor names are from general
knowledge and were **not re-verified** this session — check before quoting them publicly.

Filters applied to every idea, derived from the API constraints in `01-hackathon-rules-and-api.md`:

- Works with a 27B open model whose output cannot be trusted blindly
- No embeddings, no audio, no file input; images are allowed
- Survives queueing and 503s
- Can be demoed from a public URL with no install (votes and stars are two of three judging inputs)

## Research & discovery

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 1 | **Claim-level citation verifier** — for each cited sentence in a draft, fetch the source and show the supporting or contradicting passage | scite, Elicit, Consensus | Works on the user's own draft; shows quoted evidence, not a score | Shortlist |
| 2 | Government-scheme eligibility navigator with cited rules | myScheme (govt), Haqdarshak | Hard to beat an official portal; many hackathon clones | Drop |
| 3 | Natural-language questions over data.gov.in datasets with shown SQL | Julius, ChatGPT data analysis | Verified SQL + provenance; data cleaning is the real cost | Drop |

## Learning & education

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 4 | **Handwritten-solution misconception finder** — photo of worked maths/physics solution; find the first wrong step and name the misconception | Photomath, Khanmigo, Doubtnut | Diagnoses the student's own work instead of giving the answer | Shortlist |
| 5 | Viva / oral-exam simulator | CodeAcharya (this hackathon), many | Crowded in this hackathon | Drop |
| 6 | Guided "tour" of an unfamiliar codebase for onboarding | DeepWiki, Sourcegraph Cody | Crowded; hard to verify quality | Drop |

## Writing & creative work

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 7 | **Docs drift tester** — extract code snippets from README/docs, run them in a sandbox, report and repair the broken ones | Swimm, Mintlify, doctest-style tools | Proof by execution for documentation | Shortlist |
| 8 | Hinglish / Indian-English aware writing editor | Grammarly, LanguageTool | Weak moat; quality hard to demonstrate | Drop |
| 9 | Long-fiction continuity checker (character/timeline contradictions) | Sudowrite, NovelCrafter | Niche audience for this event | Drop |

## Work & automation

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 10 | **GST invoice reconciler** — invoice photos to structured rows, matched against purchase register | ClearTax, Zoho Books, Tally add-ons | Vision extraction + deterministic matching; incumbents are strong | Shortlist (weak) |
| 11 | Meeting notes to action items | Otter, Fireflies, Fathom | Saturated; no audio input on this API | Drop |
| 12 | Agent that fills government PDF forms from a profile | Various RPA tools | No file input; fragile | Drop |

## Everyday assistance

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 13 | **Hospital bill auditor** — photo of an itemised bill; flag duplicate lines, arithmetic errors, items above published ceiling prices | Few consumer tools in India; TPA desks | High usefulness; needs reliable reference price data | Shortlist |
| 14 | Rental agreement red-flag reader | Generic legal AI tools | Generic; legal-advice risk | Drop |
| 15 | Bank/UPI statement subscription-leak finder | CRED, Fold, bank apps | Private financial data in a hackathon demo is a liability | Drop |
| 16 | Consumer-complaint drafter (e-Daakhil ready) | Template sites | Useful but thin engineering | Drop |

## Coding & developer tools

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 17 | **Postgres query optimiser with proof by execution** — agent proposes indexes/rewrites, a sandboxed Postgres measures them and checks the rewritten query returns identical results | Aiven AI Database Optimizer / EverSQL†, pganalyze Query Advisor†, Postgres.ai, Dexter, pgMustard | Zero-install in-browser sandbox (PGlite†); equivalence check; open source | **Shortlist — top pick** |
| 18 | Flaky-test detective (re-run, bisect cause, classify) | BuildPulse, Trunk, Datadog CI | Needs CI integration; poor live demo | Drop |
| 19 | LLM prompt regression harness | promptfoo, DeepEval, Braintrust | Saturated | Drop |
| 20 | API spec-vs-reality drift tester | Schemathesis, Dredd, Postman; "API doctor" in this hackathon | Crowded in this hackathon | Drop |
| 21 | Issue-fix agent that proves the fix | SWE-agent family; dev.to entrant in this hackathon | Already entered by someone else | Drop |

## Chatbots & communities

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 22 | **Open-source maintainer triage bot** — de-duplicates issues, asks for missing repro info, labels | GitHub Copilot triage features, Dosu | Useful to maintainers; hard to demo; no embeddings | Shortlist (weak) |
| 23 | Discord/Telegram docs-answer bot with citations | Kapa.ai, Inkeep, DocsBot | Saturated | Drop |

## Something else

| # | Idea | Existing products | Differentiation available | Verdict |
|---|---|---|---|---|
| 24 | **Accessibility audit agent** — headless browser + rule engine + vision model for the judgement-based WCAG checks rules cannot do, with fix patches re-verified | axe-core/Lighthouse, WAVE, Evinced, testparty.ai† | Covers the gap left by rule engines; Indian regulatory tailwind | Shortlist |
| 25 | Reliability gateway for the BharatCode API (queue-aware retries, caching, token budget, output repair) | LiteLLM, Portkey, Helicone | Useful to every entrant; invisible in a demo; incumbents | Drop (reuse the ideas internally) |

## Evidence notes for the two strongest ideas

**#17 Query optimiser.** Aiven acquired EverSQL and ships an "AI Database Optimizer"; pganalyze
ships a "Query Advisor" (†, titles only). These are SaaS products attached to a live database.
The differentiation claim — that none of them offer a no-install sandbox with an automatic
result-equivalence proof — is **my inference and is not verified**; Postgres.ai's clone-based
approach is the closest prior art and should be credited in the README.
PGlite is real Postgres compiled to WASM and runs in browsers and Node (†).

**#24 Accessibility agent.** Deque's own study reports automated testing identifies about 57% of
issues by volume (†); other articles put coverage of WCAG criteria lower. SEBI issued digital
accessibility directions to regulated entities in July 2025 following a Supreme Court judgment on
accessible digital KYC (†, titles only; legal specifics not verified).

## Sources

- https://aiven.io/blog/aiven-ai-dboptimizer-launch
- https://aiven.io/docs/products/postgresql/howto/query-optimizer
- https://eversql.com/postgresql
- https://pganalyze.com/docs/query-advisor
- https://github.com/electric-sql/pglite
- https://electric-sql.com/product/pglite
- https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues
- https://testparty.ai/blog/automated-wcag-testing
- https://www.theweek.in/wire-updates/business/2025/07/31/dcm152-biz-sebi-mkt-access.html
- https://leglobal.law/2025/09/19/india-sebi-mandates-digital-accessibility-for-all-regulated-entities/
- https://vinodkothari.com/?p=55057
