// The query context every screen query takes: the Store to read, the person's profile and zone, the moment the query
// runs (`today` and `now` are fixed by the caller so one screen's reads agree with each other), and the units the
// screens show.
import type { Store } from "@/data/store";
import type { Profile, SyncState } from "@/data/types";
import type { Units } from "@/lib/units";

export type QueryCtx = {
  store: Store;
  profile: Profile;
  /** IANA zone, the same as `profile.timeZone`. */
  timeZone: string;
  /** Local `YYYY-MM-DD` of `now` in `timeZone`. */
  today: string;
  /** Unix seconds. */
  now: number;
  sync: SyncState;
  /**
   * The person's display units (Settings › Units). Absent means metric, as the coach's tools and the tests read it.
   * Only the view models convert (src/queries/units.ts): the Store and the scores stay metric.
   */
  units?: Units;
};
