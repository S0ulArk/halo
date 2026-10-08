// Where the coach's model comes from: the person's own key with one of these providers (BYOK), ported from Pulse's
// src/server/coach/providers.ts. The phone calls the provider directly over HTTPS; every provider gets the fetch the
// app passes in (expo/fetch on the device, which streams response bodies), so nothing goes through a Pulse server.
// Users never enter a URL: OpenRouter goes through the OpenAI-compatible client with its fixed URL.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway, type LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic" | "google" | "gateway" | "openrouter";

/** The AI SDK's fetch shape; expo/fetch is cast to it where it is created (net.ts). */
export type Fetch = typeof globalThis.fetch;

export type Provider = {
  id: ProviderId;
  label: string;
  /** Pre-filled model id; the person may type another one their provider offers. */
  model: string;
  /** Where to get a key (shown with the key field). */
  keyUrl: string;
  create: (apiKey: string, model: string, fetch?: Fetch) => LanguageModel;
};

export const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    model: "claude-opus-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    create: (apiKey, model, fetch) => createAnthropic({ apiKey, fetch })(model),
  },
  {
    id: "openai",
    label: "OpenAI",
    model: "gpt-5.4-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    create: (apiKey, model, fetch) => createOpenAI({ apiKey, fetch })(model),
  },
  {
    id: "google",
    label: "Google Gemini",
    model: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    create: (apiKey, model, fetch) => createGoogleGenerativeAI({ apiKey, fetch })(model),
  },
  {
    id: "gateway",
    label: "Vercel AI Gateway",
    model: "anthropic/claude-sonnet-5.5",
    keyUrl: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai",
    create: (apiKey, model, fetch) => createGateway({ apiKey, fetch })(model),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    model: "anthropic/claude-sonnet-5.5",
    keyUrl: "https://openrouter.ai/settings/keys",
    create: (apiKey, model, fetch) => createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey, fetch })(model),
  },
];

export const providerOf = (id: string | null | undefined) => PROVIDERS.find((p) => p.id === id) ?? null;

/** How the chat names the provider ("using Anthropic"). */
export const providerLabel = (id: string | null) => providerOf(id)?.label ?? "your provider";

/** The model to answer with, or null for an unknown provider or a missing key. */
export function modelFor(provider: string, model: string, apiKey: string | null, fetch?: Fetch): LanguageModel | null {
  const p = providerOf(provider);
  return p && apiKey ? p.create(apiKey, model, fetch) : null;
}
