// Recognises errors from a native SQLite connection that died under a live JS runtime (see `healing` in db.ts).
// Pure, so it can be tested without the native module.
//
// Every native rejection reads "Call to function 'NativeStatement.runAsync' has been rejected", ordinary SQLite errors
// included ("database is locked" while another connection writes, a constraint). Only a missing or closed native
// object means the connection itself is gone; treating the others as dead closed a live connection under its own
// running queries, and the next one to touch it crashed the app (SIGSEGV in sqlite3_step).
export const isDeadConnection = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  if (/ERR_INTERNAL_SQLITE_ERROR|Error code \d+/.test(m)) return false;
  return /NativeDatabase|NativeStatement/.test(m) && /NullPointerException|AccessClosedResource|closed resource|\bclosed\b/i.test(m);
};
