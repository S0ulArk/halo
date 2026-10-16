// Provider setup checks, ported from Pulse's saveProviderAction (src/server/actions/coach.ts): the form's rules, then
// one tiny test request with the key, so a bad key, model id or empty account is never saved.
import { APICallError, generateText } from "ai";
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

/** The provider's own words, short, with the key masked should it ever be echoed back. */
function detail(e: unknown, apiKey: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const text = raw.split(apiKey).join("•••").replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

/**
 * Why the test request failed, in words that say what to fix, with the provider's own message after it, so a refused
 * key, a wrong model id, an empty account and a phone problem each read differently.
 */
export function testFailure(e: unknown, label: string, model: string, apiKey: string, timedOut = false, alternative: string | null = null): string {
  const instead = alternative ? `, or set the model to “${alternative}”` : "";
  if (timedOut) return `${label} didn’t answer within 20 seconds. Its model “${model}” may be overloaded: try again in a minute${instead}.`;
  const said = (head: string) => {
    const d = detail(e, apiKey);
    return d ? `${head} ${label} said: “${d}”` : head;
  };
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    const body = `${e.message} ${e.responseBody ?? ""}`.toLowerCase();
    if (status === undefined) return said(`Couldn’t reach ${label}. Check your internet connection.`);
    if (status === 401 || status === 403 || /api[ _-]?key|api_key_invalid|x-api-key|unauthori[sz]ed|permission/.test(body))
      return said(`${label} didn’t accept this key. Copy it again from ${label}, with nothing before or after it.`);
    if (status === 404 || /not[ _-]?found|does not exist|no such model|invalid model|unknown model/.test(body))
      return said(`${label} has no model “${model}” for this key. Check the model id.`);
    // OpenAI's empty account is a 429 too; other 429s (Gemini's free tier among them) are limits that pass.
    if (status === 402 || /insufficient_quota/.test(body) || (status !== 429 && /credit|billing|balance|payment/.test(body)))
      return said(`Your ${label} account has no credit or quota for this model.`);
    // Overloaded: the key got through (an unknown key is refused before this), the model is just busy.
    if (status === 503 || status === 529 || /overloaded|high demand/.test(body))
      return said(`${label} accepted the key, but the model “${model}” is overloaded right now. Try again in a minute${instead}.`);
    if (status === 429) return said(`${label} is limiting this key right now (too many requests or the free quota is used up). Wait a minute and try again.`);
    return said(`${label} refused the request (error ${status}).`);
  }
  // Not an answer from the provider: the request failed on the phone (no connection, or something in the app).
  const name = e instanceof Error ? e.name : "Error";
  return `The request didn’t get to ${label} (${name}: ${detail(e, apiKey) || "no details"}). Check your connection and try again.`;
}

/**
 * One tiny request with the key. 16 output tokens rather than the web's 5: OpenAI's Responses API rejects fewer.
 * Never logs the key or the provider's body (only the error's name and status).
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
    const status = APICallError.isInstance(e) ? ` ${e.statusCode ?? "no status"}` : "";
    console.warn(`[coach] key test failed for ${c.provider}: ${e instanceof Error ? e.name : "error"}${status}`);
    const p = providerOf(c.provider);
    const alternative = [p?.model, ...(p?.alternatives ?? [])].find((m) => m && m !== c.model) ?? null;
    return { ok: false, error: testFailure(e, p?.label ?? "Your provider", c.model, c.apiKey, ctl.signal.aborted, alternative) };
  } finally {
    clearTimeout(timer);
  }
}
