// Pull to refresh with the Halo ring, in place of Android's circle (the person chose it from three mockups,
// 2026-10-17). Pulling down at the top of a page moves the whole page with the finger (iOS's rubber band) and a small
// ring fills in Halo's colours, green into indigo into orange, in the gap that opens under the bar. Past the catch point
// it ticks under the finger; let go there and the page holds open while the ring spins as a glowing arc, then the ring
// closes with a tick and the page springs back.
//
// Everything moves on the UI thread (a gesture worklet, shared values, a Skia canvas), so the pull follows the finger
// even while the JS thread is busy with the sync it started. The gesture takes over only when the page is already at
// its top and the finger goes down: scrolling, sideways drags (a chart's scrub) and taps are left alone.
import * as React from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { BlurMask, Canvas, Group, Path, Skia, SweepGradient, vec } from "@shopify/react-native-skia";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { haptic } from "@/ui/motion/haptics";

/** How far the page has to travel (dp, after the rubber band) for a release to start a refresh. */
const CATCH = 64;
/** Where the page rests while the refresh runs. */
const HOLD = 58;
/** The rubber band's reach: the page never travels further than this, however far the finger goes. */
const REACH = 260;
/** The ring's box, its radius and its stroke. */
const BOX = 36;
const R = 12.5;
const STROKE = 3.5;
/** The spinning arc's length, as a share of the ring. */
const ARC = 0.3;
/** The least time the ring spins, so a refresh that finishes at once still reads as one. */
const MIN_SPIN_MS = 700;

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 } as const;

/** iOS's rubber band: the page follows the finger, less and less the further it goes. */
function rubber(dy: number): number {
  "worklet";
  return dy <= 0 ? 0 : REACH * (1 - 1 / ((dy * 0.55) / REACH + 1));
}

const RING = (() => {
  const p = Skia.Path.Make();
  p.addCircle(BOX / 2, BOX / 2, R);
  return p;
})();
/** The tick, drawn on as the ring closes. */
const TICK = Skia.Path.MakeFromSVGString(`M ${BOX / 2 - 5.5} ${BOX / 2 + 0.5} L ${BOX / 2 - 1.5} ${BOX / 2 + 4.5} L ${BOX / 2 + 6} ${BOX / 2 - 4}`)!;

export type PullToRefreshProps = {
  refreshing: boolean;
  onRefresh: () => void;
  /** The page's scroll offset on the UI thread: the pull only starts at the top (null: no pull). */
  y: SharedValue<number> | null;
  /** Where the page's content starts under the floating bar: the ring opens just below it. */
  top: number;
  /** The scroll view (give it overScrollMode="never": the page itself stretches instead of Android's glow). */
  children: React.ReactNode;
};

/** Wraps a page's scroll view: the pull gesture, the page's travel and the ring. */
export function PullToRefresh({ refreshing, onRefresh, y, top, children }: PullToRefreshProps) {
  const c = useCalm();
  const pull = useSharedValue(0);
  /** 0 pulling or idle, 1 refreshing (the arc spins), 2 done (the ring closes with a tick). */
  const phase = useSharedValue(0);
  const busy = useSharedValue(false);
  const spin = useSharedValue(0);
  const close = useSharedValue(0);
  const caught = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startedAt = React.useRef(0);
  // Without the page's offset the pull can't tell the top from the middle, so it never starts.
  const never = useSharedValue(Number.POSITIVE_INFINITY);
  const offset = y ?? never;

  /** The spinning arc's length: the full ring at the release, shrinking to ARC as it starts to spin. */
  const arc = useSharedValue(ARC);
  // A release past the catch point counts here (from the UI thread); the refresh starts from the effect.
  const asks = useSharedValue(0);
  const [asked, setAsked] = React.useState(0);
  const onRefreshRef = React.useRef(onRefresh);
  const refreshingRef = React.useRef(refreshing);
  const closing = React.useRef(false);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
    refreshingRef.current = refreshing;
  }, [onRefresh, refreshing]);

  /** The end: the ring closes with the tick, then the page springs back. Called from effects only (it reads refs). */
  const closeRing = React.useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    startedAt.current = 0;
    cancelAnimation(spin);
    phase.set(2);
    close.set(withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    pull.set(
      withDelay(
        620,
        withSpring(0, SPRING, (finished) => {
          if (!finished) return;
          phase.set(0);
          close.set(0);
          busy.set(false);
        }),
      ),
    );
  }, [busy, close, phase, pull, spin]);

  React.useEffect(() => {
    if (!asked) return;
    startedAt.current = Date.now();
    closing.current = false;
    onRefreshRef.current();
    // An onRefresh that never reports itself running still lets the page go.
    const timer = setTimeout(() => {
      if (!refreshingRef.current) closeRing();
    }, 1000);
    return () => clearTimeout(timer);
  }, [asked, closeRing]);

  // The refresh's own state drives the ring: spinning while it runs (also when something else started it), then the
  // tick, then the page springs back. A pull has already started the spin on the UI thread.
  React.useEffect(() => {
    if (refreshing) {
      if (!startedAt.current) startedAt.current = Date.now();
      closing.current = false;
      if (phase.get() !== 1) {
        busy.set(true);
        phase.set(1);
        close.set(0);
        arc.set(1);
        arc.set(withTiming(ARC, { duration: 380, easing: Easing.out(Easing.cubic) }));
        spin.set(0);
        spin.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.linear }), -1, false));
      }
      if (pull.get() < HOLD) pull.set(withSpring(HOLD, SPRING));
      return;
    }
    if (!busy.get()) return;
    const timer = setTimeout(closeRing, Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt.current)));
    return () => clearTimeout(timer);
  }, [refreshing, arc, busy, close, closeRing, phase, pull, spin]);

  const gesture = React.useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e, state) => {
          const t = e.allTouches[0];
          if (!t || e.allTouches.length > 1 || busy.get() || offset.get() > 1) {
            state.fail();
            return;
          }
          startX.set(t.absoluteX);
          startY.set(t.absoluteY);
        })
        .onTouchesMove((e, state) => {
          const t = e.allTouches[0];
          if (!t) return;
          const dx = t.absoluteX - startX.get();
          const dy = t.absoluteY - startY.get();
          // Up is a scroll, sideways is a chart or a carousel: theirs. Down from the top is the pull.
          if (dy < -6 || (Math.abs(dx) > 10 && Math.abs(dx) > dy)) state.fail();
          else if (dy > 10) state.activate();
        })
        .onUpdate((e) => {
          const p = rubber(e.translationY);
          pull.set(p);
          if (!caught.get() && p >= CATCH) {
            caught.set(true);
            scheduleOnRN(haptic.select);
          } else if (caught.get() && p < CATCH - 8) {
            caught.set(false);
          }
        })
        .onEnd(() => {
          if (pull.get() >= CATCH) {
            busy.set(true);
            phase.set(1);
            close.set(0);
            pull.set(withSpring(HOLD, SPRING));
            // The spin starts here, on the UI thread, whatever the JS thread is doing.
            arc.set(1);
            arc.set(withTiming(ARC, { duration: 380, easing: Easing.out(Easing.cubic) }));
            spin.set(0);
            spin.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.linear }), -1, false));
            const n = asks.get() + 1;
            asks.set(n);
            scheduleOnRN(setAsked, n);
          } else {
            pull.set(withSpring(0, SPRING));
          }
        })
        .onFinalize(() => {
          caught.set(false);
          // A cancelled pull (another gesture took over) settles back.
          if (!busy.get() && pull.get() > 0) pull.set(withSpring(0, SPRING));
        }),
    [arc, asks, busy, caught, close, offset, phase, pull, spin, startX, startY],
  );

  const page = useAnimatedStyle(() => ({ transform: [{ translateY: pull.get() }] }));
  const ringBox = useAnimatedStyle(() => {
    const p = pull.get();
    // It shows as the gap opens and fades as it closes, so it never sits over the title.
    const shown = Math.min(1, Math.max(0, (p - 10) / 28));
    const grow = phase.get() === 0 ? 0.7 + 0.3 * Math.min(1, p / CATCH) : 1;
    return {
      opacity: shown,
      transform: [{ translateY: Math.max(2, p / 2 - BOX / 2) }, { scale: grow }],
    };
  });

  // The ring: filling with the pull, a spinning arc while the refresh runs, then closing with the tick.
  const end = useDerivedValue(() => {
    if (phase.get() === 0) return Math.min(1, pull.get() / CATCH);
    if (phase.get() === 1) return arc.get();
    return arc.get() + (1 - arc.get()) * close.get();
  });
  // The arc keeps its angle as it closes (the spin stops where it is).
  const turn = useDerivedValue(() => [{ rotate: -Math.PI / 2 + (phase.get() === 0 ? 0 : spin.get() * 2 * Math.PI) }]);
  const glow = useDerivedValue(() => (phase.get() === 1 ? 0.55 : 0));
  const tickEnd = useDerivedValue(() => (phase.get() === 2 ? close.get() : 0));
  const colors = [c.system.green, c.system.indigo, c.system.orange, c.system.green];
  const center = vec(BOX / 2, BOX / 2);

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, page]} collapsable={false}>
          {children}
        </Animated.View>
      </GestureDetector>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top, left: 0, right: 0, height: BOX, alignItems: "center" }, ringBox]}>
        <Canvas style={{ width: BOX, height: BOX }}>
          <Path path={RING} style="stroke" strokeWidth={STROKE} color={alpha(c.ink, 0.1)} />
          <Group origin={center} transform={turn}>
            <Group opacity={glow}>
              <Path path={RING} style="stroke" strokeWidth={STROKE + 2} strokeCap="round" start={0} end={end}>
                <SweepGradient c={center} colors={colors} />
                <BlurMask blur={4} style="normal" />
              </Path>
            </Group>
            <Path path={RING} style="stroke" strokeWidth={STROKE} strokeCap="round" start={0} end={end}>
              <SweepGradient c={center} colors={colors} />
            </Path>
          </Group>
          <Path path={TICK} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" start={0} end={tickEnd} color={c.system.green} />
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
