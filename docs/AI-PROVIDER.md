# AI provider decision

Decided 11 November 2026. Facts were read from each provider's official documentation on that
date unless marked otherwise. Free tiers change often; re-check before relying on any number here.

## What PlanProof needs from a model

The model is optional and untrusted. It does three things: explain a query plan in plain English,
extract SQL from a pasted chat answer, and propose up to two candidate fixes. One request per
verification run, about 1,500–3,000 tokens in and under 1,000 out.

So the requirements are modest:

- a real free tier, with **no payment method** needed to get a key
- server-side use from a public website allowed by the terms
- JSON output constrained to a schema (strict mode preferred)
- enough capacity for a demo and moderate portfolio traffic
- no training on what users paste, ideally

Model quality matters less than it would elsewhere, because a wrong suggestion is caught by
execution. Reliability of the JSON shape matters more.

## Options evaluated

| Provider | Free without payment? | Free capacity (documented) | Schema-constrained output | Notes |
|---|---|---|---|---|
| **Groq** | Payment method required only to upgrade to Developer tier¹ | Per model: e.g. `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` 30 RPM, 1,000 RPD, 8K TPM, 200K TPD | `json_schema` with `strict: true` on gpt-oss-20b/120b and qwen3.8-27b | Inference data not retained by default; logs up to 30 days for abuse; Zero Data Retention can be enabled by any customer |
| Google Gemini (AI Studio) | Yes | Free tier on Flash / Flash-Lite models; per-model limits no longer published, shown per project in AI Studio | Structured output via OpenAI-compatible endpoint | Free tier: content used to improve Google products and may be read by human reviewers; terms require **paid** services when an app is made available to users in the EEA, Switzerland or the UK |
| OpenRouter (`:free` models) | Yes | 20 RPM; **50 requests/day** until $10 of credits have ever been bought, then 1,000/day | Depends on the underlying model | Free-model routing varies by upstream provider |
| Cloudflare Workers AI | Yes (Workers Free) | 10,000 neurons/day, then requests fail | JSON mode (separate docs) | Good fit if hosting on Cloudflare; needs a Cloudflare account and account-specific URL |
| Cerebras | No: free credit needs a verified payment method² | 5 RPM, 1M tokens/day | Not checked | Excluded by the no-payment rule |
| Hugging Face, GitHub Models | Yes | Small monthly credits / prototyping-oriented limits | Varies | Not suited to a public app |

¹ Groq's billing FAQ states a payment method is needed to upgrade from Free to Developer. It does
not state explicitly that the Free tier never asks for one; third-party guides consistently report
no card is needed. **Unverified from an official source.**
² From a third-party summary of Cerebras's rate-limit docs (checked 16 Oct 2026), not the official page.

## Decision

**Primary: Groq, model `openai/gpt-oss-120b`.** Fallback: **Groq, `qwen/qwen3.8-27b`**, using the same key.

Why:

1. **Strict JSON-schema decoding** on both models. Groq documents `strict: true` support for
   them, which removes most malformed-output failures before PlanProof's own validation.
2. **Free without a card**, as far as can be verified (see footnote 1), and usage cannot turn into a
   bill: without a payment method on file the account stays on the Free tier, and exceeding a limit
   returns HTTP 429.
3. **Terms fit a public site.** Unlike Gemini's free tier, nothing found restricts serving users in
   particular regions, and inference data is not retained by default.
4. **Capacity per model, so the fallback is real.** Groq's limits are per model. When gpt-oss-120b
   hits a limit, qwen3.8-27b has its own 1,000 requests/day.
5. **Latency.** Groq is built for fast inference, which matters when the model call sits in the
   middle of an interactive run. (Not measured here: no network path to Groq from the build environment.)

### Constraints this creates

- **8K tokens per minute per model** is the tightest limit: roughly 3–4 analyses per minute per model.
  PlanProof keeps prompts small, caps output at 2,000 tokens and sets low reasoning effort.
- Rate limits are per Groq organisation, shared by every visitor of a deployment.
- When both models are rate-limited, AI analysis is skipped and the page says so. **Verification
  never depends on the model**, so pasted suggestions are still fully tested.

## Architecture

```
handler.ts ──► analyze.ts ──► ChatProvider (provider.ts, OpenAI-compatible)
 (HTTP, limits)  (prompt, chain,      │
                  parse, Zod)         ├─ groq:openai/gpt-oss-120b
                                      ├─ groq:qwen/qwen3.8-27b
                                      └─ any other "provider:model" in AI_CHAIN
```

- `provider.ts` knows HTTP, not SQL. It sends `response_format: json_schema` (strict), falls back to
  `json_object` once if a model rejects schemas, and classifies failures into typed errors.
- `analyze.ts` walks the chain: transient errors (5xx, network, timeout) are retried once on the same
  model; a 429 with a short `Retry-After` (≤3 s) is waited out; anything else moves to the next model.
  A 45 s overall deadline bounds the whole call.
- `config.ts` builds the chain from environment variables. Presets exist for `groq`, `gemini`,
  `openrouter` and `custom` (any OpenAI-compatible URL, such as a local Ollama).

## Configuration

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Enables the default chain. Nothing else is required. |
| `AI_CHAIN` | Optional order, e.g. `groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b` |
| `GEMINI_API_KEY` | Enables `gemini:<model>` entries. Read the terms caveat above before using on a public site. |
| `OPENROUTER_API_KEY` | Enables `openrouter:<model>` entries |
| `AI_CUSTOM_BASE_URL`, `AI_CUSTOM_API_KEY` | Enables `custom:<model>` for any OpenAI-compatible endpoint |

Recommended once deployed: enable **Zero Data Retention** in Groq's Data Controls.

## Sources

- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq structured outputs: https://console.groq.com/docs/structured-outputs
- Groq reasoning parameters: https://console.groq.com/docs/reasoning
- Groq data handling: https://console.groq.com/docs/your-data
- Groq billing FAQ: https://console.groq.com/docs/billing-faqs
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini pricing (free-tier data use): https://ai.google.dev/gemini-api/docs/pricing
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini API terms: https://aistudio.google.com/docs/terms
- OpenRouter limits: https://openrouter.ai/docs/api/reference/limits
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cerebras free tier summary (third party): https://benchlm.ai/md/free-tier/cerebras.md
