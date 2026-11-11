# 01 — Hackathon rules and BharatCode API (research notes)

Researched: 10 November 2026, ~22:30–22:40 IST. Every fact below is tagged:

- **[Official]** read from a bharatcode.ai page this session
- **[Third-party]** read from a listing site; may be stale
- **[Unverified]** could not be confirmed anywhere

## 1. The deadline problem (read this first)

- **[Official]** "Register and submit by 10 November 2026 · 11:59 PM IST" — bharatcode.ai/hackathon.
  This research was done on the evening of the deadline itself.
- **[Third-party]** Older listings show earlier deadlines: 25 Oct 2026 (Internshala, StartupGrantsIndia)
  and 7 Nov 2026 (IndianAICommunity tracker). So the deadline appears to have moved at least twice.
  A further extension is possible but **[Unverified]** and must not be relied on.
- **[Official]** "No finished project needed" to register. Submission = a public GitHub repo link.
- **[Unverified]** Whether the repo may keep changing after the deadline, when voting opens/closes,
  and when judges look at the repo. The page is silent on all three.

**Working assumption:** register and submit the repo link before the deadline, then keep building.
A repo link (not a snapshot upload) is what is submitted, so later commits will be visible, but
whether late work *counts* is unknown. Treat every day after the deadline as possibly judged.

## 2. Rules

| Item | Detail | Status |
|---|---|---|
| Round | Page is headed "Build League · Round 1". No Round 2 described. | Official |
| Eligibility | Students and other builders; solo or "small team"; no max team size stated | Official |
| Account | Entry tied to a BharatCode account (Google, GitHub or email sign-in) | Official |
| Direction | Pick one of 8 categories at registration; "you can change it later" | Official |
| Format | Website, mobile app, bot, CLI or integration; need not run inside the BharatCode app | Official |
| Repo | Public GitHub repo, any name; submit the main repo URL (not a file/branch link) | Official |
| `BharatCode.txt` | Must be in the root of the default branch; any capitalisation. **Contents not specified.** One form checklist item calls it "Optional", contradicting the step text. Include it. | Official (ambiguous) |
| Form fields | Project name (2–160 chars), repo URL, optional summary (≤1,000 chars) | Official |
| Prohibited | Secrets, tokens, private links, private user data in the repo | Official |
| Model calls | Projects use BharatCode's model API | Official |
| Demo video / hosted link | Not required by the page | Official (absence) |

### Categories
Research & discovery · Learning & education · Writing & creative work · Work & automation ·
Everyday assistance · Coding & developer tools · Chatbots & communities · Something else

### Judging
Three inputs **[Official]**: GitHub stars, BharatCode website votes (one per account, changeable),
and judges' evaluation. "Community score" = stars + votes only. **Weights are not published.**

Implication: a zero-setup public demo and a README that earns stars matter as much as the code.

### Prizes
- **[Official]** ₹10,000 first prize; 1,000 GC; 3 Ginhouse event tickets; possible official
  BharatCode offering (not automatic); 1,000 Adaption credits per participant; US$1,000 Adaption
  credits per winning team member; Ginclair learning-path discount.
- **[Third-party]** "₹60,000 SDE internship" appears in the Unstop listing title/URL, and one tracker
  says the winner gets "an opportunity to interview for a paid role". The official hackathon page
  read this session **does not mention an internship**. Treat as an interview opportunity at best.
- **[Unverified]** The Unstop listing itself could not be loaded (page returned no content).

## 3. BharatCode model API (from bharatcode.ai/build) — all [Official]

- Base URL: `https://bharatcode.ai/api/model/v1`
- Auth: `Authorization: Bearer <BHARATCODE_API_KEY>`; keys from bharatcode.ai/account.
  Keys must stay server-side.
- OpenAI-compatible; works with the OpenAI SDK by setting `baseURL`.
- Endpoints: `POST /responses`, `POST /chat/completions`, `GET /models`.

| Model | ID | Access |
|---|---|---|
| BharatCode Qwen 3.8 27B | `qwen-3.8-27b` | Verified students (10M tokens/day), Lite, Pro |
| BharatCode DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | Pro only |

Capabilities on `/responses`: text + image input, streaming (SSE), function tools
(`strict`, `tool_choice`), structured output via `text.format`. Max output 32,000 tokens
including reasoning.

Constraints that shape the architecture:

1. **Stateless.** `store:true` and `previous_response_id` return 400. Full history must be replayed
   on each call, including `response.output` items and `function_call_output` items.
2. **No hosted tools.** The application validates arguments and executes every tool itself.
3. **No embeddings endpoint mentioned.** Retrieval needs lexical search or a local embedding model.
4. **No audio, video or file input** (400). Images only.
5. **Shared capacity.** Requests may queue; `503` = busy, retry after a few seconds; a started
   stream can end in `response.failed`. Keepalive comments appear in streams.
6. **Truncation.** `status:"incomplete"` / `finish_reason:"length"` can arrive with HTTP 200;
   incomplete tool calls must not be executed.
7. Context window sizes and numeric rate limits are **not published**.

**[Unverified]** How long student verification takes, and whether a non-verified account gets any
free API access. If verification is slow this is a schedule risk — start it immediately.

## 4. What other entrants are building (crowding check)

Found via web search; only `prepcoach` was opened and read, the rest are from repo titles/descriptions.

| Repo | What it is | Category |
|---|---|---|
| eres0045/prepcoach | Placement prep coach (mock interview, resume, DSA); Flask | Education |
| ankushsingh21123-blip/vidya-ai | Study companion for competitive exams | Education |
| heyranjanshaw07/CodeAcharya | AI coding mentor, browser IDE, hints, viva | Education / dev |
| Revatigc/DevPilot-AI | "Autonomous software engineering platform" | Dev tools |
| ashutoshraj163/reposhield-ai | Repo security scanning | Dev tools |
| kanishik0011/API.-doctor | API debugging + test generator | Dev tools |
| shuyad02/Bharatcraft | v0/Bolt-style web builder | Dev tools |
| dev.to (newbiedev28) | Coding agent that proves GitHub issue fixes work | Dev tools |
| AdityaKatyal8899/DOCK, learnfast12/cybernetx-bharatcode, Kavaykhurana/bharatcode | Not inspected | Unknown |

Pattern: study and placement companions, and broad AI software-engineering platforms, are well
represented. Narrow tools built around a verifiable result are less common.

## Sources

- https://bharatcode.ai/hackathon
- https://auth.bharatcode.ai/hackathon?step=register
- https://bharatcode.ai/build
- https://bharatcode.ai/leadership (people leaderboard only; no project list or voting dates)
- https://internshala.com/competitions/bharatcode-build-league-hackathon-2026/
- https://www.startupgrantsindia.com/competitions/bharatcode-build-league
- https://indianaicommunity.com/tracker/opportunities/bharatcode-build-league-9b98ae
- https://unstop.com/hackathons/bharatcode-build-league-bharatcode-build-league-build-with-ai-and-win-rs10000-and-a-rs60000-sde-internship-bh-1776294 (could not be read)
- https://github.com/eres0045/prepcoach
- https://github.com/ankushsingh21123-blip/vidya-ai
- https://github.com/heyranjanshaw07/CodeAcharya
- https://github.com/Revatigc/DevPilot-AI
- https://github.com/ashutoshraj163/reposhield-ai
- https://github.com/kanishik0011/API.-doctor.apiBharatCode.txt
- https://github.com/shuyad02/Bharatcraft
- https://dev.to/newbiedev28/i-built-an-open-source-ai-coding-agent-that-makes-github-issue-fixes-prove-they-actually-work-4fhp
