import { createOpenAICompatibleProvider, type ChatProvider, type OpenAICompatibleConfig } from './provider';

/**
 * Provider configuration from environment variables. See docs/AI-PROVIDER.md
 * for why Groq is the default and what each preset implies.
 *
 *   GROQ_API_KEY        enables the default chain (no other setting needed)
 *   AI_CHAIN            optional ordered list "provider:model,provider:model"
 *   GEMINI_API_KEY      enables the "gemini" preset (read the terms caveat first)
 *   OPENROUTER_API_KEY  enables the "openrouter" preset
 *   AI_CUSTOM_BASE_URL, AI_CUSTOM_API_KEY  enable the "custom" preset
 *                       (any OpenAI-compatible endpoint, e.g. a local Ollama)
 */

type Preset = Omit<OpenAICompatibleConfig, 'apiKey' | 'model' | 'fetch'> & {
  keyEnv: string;
  baseUrlEnv?: string;
  /** Parameters by model id prefix; first match wins. */
  modelParams?: { prefix: string; params: Record<string, unknown> }[];
};

export const PRESETS: Record<string, Preset> = {
  groq: {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    strictSchema: true,
    maxTokensParam: 'max_completion_tokens',
    maxTokens: 2_000,
    modelParams: [
      // keep hidden reasoning short: the free plan allows 8K tokens per minute per model
      { prefix: 'openai/gpt-oss', params: { reasoning_effort: 'low', include_reasoning: false } },
      { prefix: 'qwen/', params: { reasoning_effort: 'none', reasoning_format: 'hidden' } },
    ],
  },
  gemini: {
    id: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    strictSchema: true,
    maxTokensParam: 'max_tokens',
    maxTokens: 2_000,
    modelParams: [{ prefix: 'gemini-', params: { reasoning_effort: 'low' } }],
  },
  openrouter: {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    strictSchema: true,
    maxTokensParam: 'max_tokens',
    maxTokens: 2_000,
  },
  custom: {
    id: 'custom',
    baseUrl: '',
    baseUrlEnv: 'AI_CUSTOM_BASE_URL',
    keyEnv: 'AI_CUSTOM_API_KEY',
    strictSchema: true,
    maxTokensParam: 'max_tokens',
    maxTokens: 2_000,
  },
};

/**
 * Default chain when AI_CHAIN is not set. Both use the same Groq key; Groq's
 * free-plan limits are per model, so the second model is real extra capacity.
 */
export const DEFAULT_CHAIN = 'groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b';

export interface ChainEntry {
  provider: string;
  model: string;
}

export function parseChain(spec: string): ChainEntry[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':');
      if (i <= 0 || i === s.length - 1) throw new Error(`AI_CHAIN entry "${s}" must look like provider:model.`);
      return { provider: s.slice(0, i).trim(), model: s.slice(i + 1).trim() };
    });
}

export interface ResolvedConfig {
  providers: ChatProvider[];
  /** Entries that were skipped and why (missing key, unknown provider). Safe to log; contains no secrets. */
  skipped: string[];
}

export function providersFromEnv(env: Record<string, string | undefined>, fetchImpl?: typeof fetch): ResolvedConfig {
  const spec = env.AI_CHAIN?.trim() || DEFAULT_CHAIN;
  const providers: ChatProvider[] = [];
  const skipped: string[] = [];
  let entries: ChainEntry[];
  try {
    entries = parseChain(spec);
  } catch (e) {
    return { providers: [], skipped: [(e as Error).message] };
  }
  for (const { provider, model } of entries) {
    const preset = PRESETS[provider];
    if (!preset) {
      skipped.push(`${provider}: unknown provider`);
      continue;
    }
    const apiKey = env[preset.keyEnv]?.trim();
    if (!apiKey) {
      skipped.push(`${provider}:${model}: ${preset.keyEnv} is not set`);
      continue;
    }
    const baseUrl = preset.baseUrlEnv ? env[preset.baseUrlEnv]?.trim() || preset.baseUrl : env[`${provider.toUpperCase()}_BASE_URL`]?.trim() || preset.baseUrl;
    if (!baseUrl) {
      skipped.push(`${provider}:${model}: ${preset.baseUrlEnv} is not set`);
      continue;
    }
    const params = preset.modelParams?.find((m) => model.startsWith(m.prefix))?.params;
    providers.push(
      createOpenAICompatibleProvider({
        id: preset.id,
        baseUrl,
        apiKey,
        model,
        strictSchema: preset.strictSchema,
        maxTokensParam: preset.maxTokensParam,
        maxTokens: preset.maxTokens,
        extraBody: params,
        fetch: fetchImpl,
      }),
    );
  }
  return { providers, skipped };
}
