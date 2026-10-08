// Local-time helpers shared by the sources, the pipeline and the queries. Instants are unix seconds;
// days are local `YYYY-MM-DD` in the configured IANA zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local wall-clock reading of instant `s`: the day, `HH:mm:ss`, and that wall time read as if it were UTC. */
export function wall(s: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(s * 1000)).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}:${p.second}`,
    // `% 24`: some Intl engines print midnight as hour "24" even with hourCycle h23.
    asUtc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000,
  };
}

/** The local day containing instant `s`. */
export const localDay = (s: number, tz: string) => wall(s, tz).day;

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const midnights = new Map<string, number>();

/**
 * The first instant of local `day`. Midnight is tried under each offset in force within a day of it, and the
 * earliest candidate that falls on `day` wins: the first of a repeated midnight (fall-back to 00:00), or the
 * transition itself when a spring-forward at 00:00 skips midnight (Santiago, Havana, Azores...).
 */
export function localMidnight(day: string, tz: string): number {
  // Memoised: it is a pure function of the day and the zone, and costs six Intl calls, which are slow under Hermes. The
  // import spreads every interval record over the days it touches with it, so a few days of per-minute calorie
  // records asked for the same handful of midnights tens of thousands of times.
  const key = `${tz} ${day}`;
  const known = midnights.get(key);
  if (known !== undefined) return known;
  const utc = Date.parse(`${day}T00:00:00Z`) / 1000;
  const offset = (s: number) => wall(s, tz).asUtc - s;
  const out = Math.min(...[-86_400, 0, 86_400].map((d) => utc - offset(utc + d)).filter((s) => localDay(s, tz) === day));
  if (midnights.size >= 4096) midnights.clear();
  midnights.set(key, out);
  return out;
}

/** The instant a local wall time (`YYYY-MM-DDTHH:mm[:ss]`) names in `tz`; in a DST gap, the same offset trick as localMidnight. */
export function fromWall(civil: string, tz: string): number {
  const utc = Date.parse(`${civil.length === 16 ? `${civil}:00` : civil}Z`) / 1000;
  const offset = (s: number) => wall(s, tz).asUtc - Math.floor(s);
  return utc - offset(utc - offset(utc));
}

/** Seconds `tz` is ahead of UTC at instant `s`. */
export const utcOffsetS = (s: number, tz: string) => wall(s, tz).asUtc - Math.floor(s);

/**
 * Minutes after local midnight of instant `s` as the clock reads them (07:39 → 459), DST days included. Its callers want
 * a time of day (wake and bed times, the 17:00 review switch), so this is not the time elapsed since midnight: that ran
 * an hour ahead after a fall-back change (07:39 read as 08:39) and an hour behind after a spring-forward one.
 */
export const localMinutes = (s: number, tz: string) => {
  const w = wall(s, tz);
  return Math.round((w.asUtc - Date.parse(`${w.day}T00:00:00Z`) / 1000) / 60);
};

// Age from a `YYYY-MM-DD` birth date on a `YYYY-MM-DD` day. Both agree on every day: fractionalYears floors
// to wholeYears and equals it on a birthday. A Feb 29 birthday falls on Mar 1 in common years.

/** Completed years on `day`; the birthday itself counts. Sleep need and the max-HR estimate use this. */
export function wholeYears(birthDate: string, day: string) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Completed years plus the elapsed share of the current birthday year. Healthspan and fitness use this. */
export function fractionalYears(birthDate: string, day: string) {
  const whole = wholeYears(birthDate, day);
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const birthday = (n: number) => Date.UTC(by + n, bm - 1, bd); // Feb 29 in a common year rolls to Mar 1
  return whole + (Date.parse(day) - birthday(whole)) / (birthday(whole + 1) - birthday(whole));
}
