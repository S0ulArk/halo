// A time zone as people read it (the web's describeZone): "Kolkata, Asia (GMT+5:30)". The offset comes from lib/time's
// wall clock (Intl formatToParts), so it needs nothing Hermes lacks.
import { utcOffsetS } from "@/lib/time";

/** "GMT+5:30", "GMT-4", "GMT+0" for `tz` at `nowS`. */
export function gmtOffset(tz: string, nowS = Date.now() / 1000): string {
  let s: number;
  try {
    s = utcOffsetS(nowS, tz);
  } catch {
    return "";
  }
  const m = Math.round(s / 60);
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  return `GMT${m < 0 ? "-" : "+"}${h}${r ? `:${String(r).padStart(2, "0")}` : ""}`;
}

export function describeZone(id: string, nowS?: number): string {
  const parts = id.split("/");
  const city = (parts[parts.length - 1] ?? id).replace(/_/g, " ");
  const region = parts.length > 1 ? parts.slice(0, -1).join(" / ").replace(/_/g, " ") : "";
  const offset = gmtOffset(id, nowS);
  return `${region ? `${city}, ${region}` : city}${offset ? ` (${offset})` : ""}`;
}
