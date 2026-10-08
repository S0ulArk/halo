// A small pure string hash for the pipeline's memo keys (the web app used sha1 from node:crypto, which Hermes
// lacks). Two FNV-1a 32-bit passes over the input, seeded differently, give a 16-hex-character key, the same
// width as the web's truncated sha1. Only equality matters: a key changes when its inputs do.

function fnv1a(s: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 16 hex characters derived from `s`. */
export const sha = (s: string) =>
  fnv1a(s, 0x811c9dc5).toString(16).padStart(8, "0") + fnv1a(s, 0x9747b28c).toString(16).padStart(8, "0");
