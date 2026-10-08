// Recognises errors from a native SQLite connection that died under a live JS runtime (see `healing` in db.ts).
// Pure, so it can be tested without the native module.
export const isDeadConnection = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /NativeDatabase|NativeStatement/.test(m) && /NullPointerException|closed|AccessClosedResource|has been rejected/i.test(m);
};
