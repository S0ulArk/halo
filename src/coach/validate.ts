// Provider setup checks, ported from Pulse's saveProviderAction (src/server/actions/coach.ts): the form's rules, then
// one tiny test request with the key, so a bad key, model id or empty account is never saved.
import { generateText } from "ai";
import { modelFor, providerOf, type Fetch } from "./providers";

export type ProviderInput = { provider: string; model: string; apiKey: string };
export type Checked = { ok: true; provider: string; model: string; apiKey: string } | { ok: false; error: string };

/** The web's zod rules, as plain checks: a known provider, a model id providers use, a key of plausible length. */
export function checkProvider(input: ProviderInput): Checked {
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  if (!providerOf(input.provider)) return { ok: false, error: "Pick a provider." };
  if (!model) return { ok: false, error: "Enter a model." };
  if (model.length > 120 || !/^[\w.:/@-]+$/.test(model)) return { ok: false, error: "That model id has characters no provider uses." };
  if (!apiKey) return { ok: false, error: "Paste your API key." };
  if (apiKey.length < 8) return { ok: false, error: "That key looks too short." };
  if (apiKey.length > 500) return { ok: false, error: "That key looks too long." };
  return { ok: true, provider: input.provider, model, apiKey };
}

export const TEST_FAILED = "That didn’t work: check the key and the model id, and that your account has credit.";

/**
 * One tiny request with the key. 16 output tokens rather than the web's 5: OpenAI's Responses API rejects fewer.
 * Never logs the key or the provider's body (only the error's name).
 */
export async function testKey(input: ProviderInput, fetch?: Fetch, timeoutMs = 20_000): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = checkProvider(input);
  if (!c.ok) return c;
  const model = modelFor(c.provider, c.model, c.apiKey, fetch);
  if (!model) return { ok: false, error: "Pick a provider." };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeoutMs);
  try {
    await generateText({ model, prompt: "Reply with OK.", maxOutputTokens: 16, maxRetries: 0, abortSignal: ctl.signal });
    return { ok: true };
  } catch (e) {
    console.warn(`[coach] key test failed for ${c.provider}: ${e instanceof Error ? e.name : "error"}`);
    return { ok: false, error: TEST_FAILED };
  } finally {
    clearTimeout(timer);
  }
}
