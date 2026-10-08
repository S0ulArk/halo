// Two tiny app-wide signals for the Journal. The web drives its check-in sheet from the URL (`?checkin=1`, mounted
// once in the app layout) and revalidates pages after a write; here a module-level event opens the one mounted sheet
// (CheckInSheetHost), and a version number tells the journal screens to refetch right after a write, before the
// rescoring run that follows it ends.
import * as React from "react";

type Listener = (day: string | null) => void;
const openers = new Set<Listener>();

/** Opens the check-in sheet over the current screen for `day` (default: the screen's `?d=`, else today). */
export function openCheckIn(day?: string | null) {
  for (const l of openers) l(day ?? null);
}

/** For the sheet host: called with the requested day (or null) whenever something opens the check-in. */
export function useOpenCheckInListener(listener: Listener) {
  const ref = React.useRef(listener);
  React.useLayoutEffect(() => {
    ref.current = listener;
  });
  React.useEffect(() => {
    const l: Listener = (d) => ref.current(d);
    openers.add(l);
    return () => {
      openers.delete(l);
    };
  }, []);
}

let version = 0;
const watchers = new Set<() => void>();

/** Bumped after every journal, behaviour or log write. */
export function bumpJournal() {
  version += 1;
  for (const w of watchers) w();
}

/** The journal data version: put it in a useQuery's deps to refetch after a write. */
export function useJournalVersion(): number {
  return React.useSyncExternalStore(
    (cb) => {
      watchers.add(cb);
      return () => {
        watchers.delete(cb);
      };
    },
    () => version,
    () => version,
  );
}
