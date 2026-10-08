// Keyboard helpers on top of react-native-keyboard-controller, for scroll views the library's own components don't
// cover: a bottom sheet that lifts itself over the keyboard (its scroll view shrinks, so the focused field can end up
// under the sheet's footer) and the coach's chat (a field inside the message list).
import * as React from "react";
import { TextInput, type View } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

type HostInput = NonNullable<ReturnType<typeof TextInput.State.currentlyFocusedInput>>;
export type Scroller = {
  scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void;
  measure: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};

/** Air kept over a field scrolled down into view. */
const TOP_GAP = 16;

export type KeepVisibleOptions = {
  /** The scroll view (anything with `measure` and `scrollTo`). */
  scroll: React.RefObject<Scroller | null>;
  /** The View holding the scroll view's content, at the top of its content container. */
  content: React.RefObject<View | null>;
  /** The scroll view's offset, tracked on the UI thread (Reanimated `useScrollOffset`). */
  offset: SharedValue<number>;
  /** Air kept under the field (more keeps a button under it in view); 16 px over it. */
  gap?: number;
  /** Px at the foot of the scroll view hidden by what floats over it (keyboard, composer); 0 by default. */
  hiddenBelow?: () => number;
  /** Fields scrolled to the top of the visible area rather than just into it (a search with results under it). */
  atTop?: Set<HostInput>;
};

/**
 * Keeps the focused TextInput inside `content` in view: once the keyboard has finished opening, and again when focus
 * moves to another field while it is open, the scroll view scrolls just enough to show the whole field, `gap` px clear
 * of the visible area's foot and 16 px of its head. A field outside `content` (a composer pinned over the list) is
 * left alone. Returns the check itself, for a layout change that can hide the field.
 */
export function useKeepFocusedInputVisible({ scroll, content, offset, gap = 16, hiddenBelow, atTop }: KeepVisibleOptions): () => void {
  // The check reads refs and the latest options when it runs (after the keyboard settles), never during render.
  const check = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    check.current = () => {
      const input = TextInput.State.currentlyFocusedInput();
      const sv = scroll.current;
      const host = content.current;
      if (!input || !sv || !host) return;
      sv.measure((_x, _y, _w, viewHeight) => {
        input.measureLayout(
          host,
          (_ix, y, _iw, height) => {
            const visible = viewHeight - (hiddenBelow?.() ?? 0);
            const now = offset.value;
            // The smallest offset that shows the field's foot, and the largest that still shows its head.
            const lowest = y + height + gap - visible;
            const highest = y - TOP_GAP;
            const next = atTop?.has(input) ? highest : now < lowest ? lowest : now > highest ? highest : now;
            if (Math.abs(next - now) >= 1) sv.scrollTo({ y: Math.max(0, next), animated: true });
          },
          () => {},
        );
      });
    };
  });
  const reveal = React.useCallback(() => check.current(), []);
  // Focus lands in JS (TextInput.State) a moment after the native keyboard event: check once that has caught up.
  const soon = React.useCallback(() => {
    setTimeout(reveal, 32);
  }, [reveal]);
  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        if (e.height > 0) scheduleOnRN(soon);
      },
    },
    [soon],
  );
  return reveal;
}
