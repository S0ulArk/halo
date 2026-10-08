// Keeps the screen on while it is mounted: a breathing session or a live workout runs its pacer, cues and live heart
// rate in the foreground, so the screen timing out mid-session would pause them.
import { useKeepAwake } from "expo-keep-awake";

export function KeepAwake({ tag }: { tag: string }) {
  useKeepAwake(tag);
  return null;
}
