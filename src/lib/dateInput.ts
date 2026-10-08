// A typed date as YYYY-MM-DD: digits only, the dashes put in for you. Typing the year's fourth digit or the month's
// second adds the dash after it at once; deleting never puts one back, so backspace walks over a dash naturally.

/** `next` (what the field now holds) as a YYYY-MM-DD in progress; `prev` tells typing from deleting. */
export function maskDate(prev: string, next: string): string {
  const digits = next.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 4);
  if (digits.length > 4) out += `-${digits.slice(4, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6)}`;
  const typing = next.length > prev.length;
  if (typing && (digits.length === 4 || digits.length === 6)) out += "-";
  return out;
}
