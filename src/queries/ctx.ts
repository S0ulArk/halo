// The query context every screen query takes: the Store to read, the person's profile and zone, and the
// moment the query runs (`today` and `now` are fixed by the caller so one screen's reads agree with each other).
import type { Store } from "@/data/store";
import type { Profile, SyncState } from "@/data/types";

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
};
