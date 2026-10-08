// The fetch the coach's providers use on the phone: expo/fetch, whose response body is a ReadableStream (React Native's
// own fetch buffers the whole body, which would turn a streamed answer into one late block). Kept in its own module so
// tests never load the native module: they pass their own fetch to providers.ts.
import { fetch as expoFetch } from "expo/fetch";
import type { Fetch } from "./providers";

export const deviceFetch = expoFetch as unknown as Fetch;
