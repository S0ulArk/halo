import * as React from "react";
import { BackHandler, TextInput, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent } from "react-native";
import {
  ANIMATION_SOURCE,
  ANIMATION_STATUS,
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  KEYBOARD_STATUS,
  useBottomSheetInternal,
  useScrollEventsHandlersDefault,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  type BottomSheetFooterProps,
  type ScrollEventsHandlersHookType,
} from "@gorhom/bottom-sheet";
import { KeyboardController, useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, { css, useAnimatedReaction, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { alpha } from "@/lib/utils";
import { AccentScope, useScreenAccent, type AccentFamily } from "@/ui/accents";
import { useCalm } from "@/ui/calm";
import { useKeepFocusedInputVisible, type Scroller } from "@/ui/keyboard";
import { EntranceScope } from "@/ui/motion/Entrance";
import { reduceMotionNow } from "@/ui/motion/system";
import { ThemeBridge, useTheme, type Theme } from "@/ui/ThemeProvider";
import { Button } from "./Button";
import { OnCard } from "./calmKit";
import { useCoverLayer } from "./Overlay";
import { Txt } from "./Text";

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Stacked full-width actions: `Button size="sheet"` (the teal primary, then `variant="outline-pill"`, a quiet grey). */
  footer?: React.ReactNode;
  /** `tall`: the sheet takes 92 % of the screen whatever its content. */
  size?: "default" | "tall";
  /** With the keyboard open, the room kept under a focused field (16): more keeps a button under the field in view. */
  keyboardGap?: number;
};

/** A section label inside a sheet ("Time ───"): 13/18 semibold grey, sentence case, a `line` hairline to the edge. */
export function SheetSection({ children }: { children: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Txt size={13} lineHeight={18} weight={600} style={{ color: c.sub }}>
        {children}
      </Txt>
      <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
    </View>
  );
}

type HostInput = NonNullable<ReturnType<typeof TextInput.State.currentlyFocusedInput>>;
const AtTop = React.createContext<Set<HostInput> | null>(null);

/**
 * Inside a BottomSheet: when this field is focused, the sheet scrolls it to the top of what shows above the keyboard
 * rather than just into view, so what it filters (a search's results) shows under it.
 */
export function useSheetFieldAtTop(ref: React.RefObject<TextInput | null>) {
  const set = React.useContext(AtTop);
  React.useEffect(() => {
    const input = ref.current;
    if (!set || !input) return;
    set.add(input);
    return () => {
      set.delete(input);
    };
  }, [set, ref]);
}

// --- Motion ---

/**
 * The open and close: a critically damped spring (ω ≈ 26 rad/s), 95 % there in 180 ms and settled by about 300 ms,
 * the old 320 ms ease-out-expo slide's feel, and a release carries the finger's speed into it. A drag-dismiss is the
 * same spring run from the release velocity. On the UI thread (Reanimated), so it never waits for JS.
 */
const SPRING = { damping: 52, stiffness: 680, mass: 1, overshootClamping: true };
/**
 * The sheet counts as open (and its content mounts) this close to its resting place: gorhom's index runs from −1
 * (closed) to 0 (open), so this is the last 0.6 % of the travel, a few px of the spring's tail.
 */
const OPENED_AT = -0.006;
/** The first-ever open of a sheet, before its content height is known, reserves this share of the maximum height. */
const FIRST_GUESS = 0.6;
/** The content fades in over the light first frame once the sheet has settled (Reanimated CSS animation, UI thread). */
const CONTENT_IN = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
/** The height the content last had, per sheet title: the next open reserves it, so the sheet opens to its real size. */
const lastHeight = new Map<string, number>();

// --- The chrome around the content, rendered at the portal host ---

/**
 * What the sheet's handle, footer, background and content read. The sheet renders at the root's portal host
 * (BottomSheetModalProvider), outside its screen's providers, so the screen's theme and accent are carried along here.
 */
type Chrome = {
  theme: Theme;
  accent: AccentFamily | null;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  close: () => void;
  bottom: number;
  /** The footer's measured height (it floats over the scroll view's foot). */
  footerHeight: SharedValue<number>;
};
const ChromeCtx = React.createContext<Chrome | null>(null);
const useChrome = () => React.useContext(ChromeCtx)!;

type Store<T> = { get: () => T; set: (v: T) => void; subscribe: (fn: () => void) => () => void };
function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      value = v;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** The portal-side root of one sheet: re-provides the declaring screen's theme and accent, and the chrome. */
function makeContainer(store: Store<Chrome | null>) {
  return function SheetContainer({ children }: { children?: React.ReactNode }) {
    const chrome = React.useSyncExternalStore(store.subscribe, store.get, store.get);
    // Set by the sheet's layout effect before it can present.
    if (!chrome) return null;
    return (
      <ThemeBridge value={chrome.theme}>
        <AccentScope family={chrome.accent}>
          {/* Cards inside a sheet appear with it: no entrance cascade of their own over the slide. */}
          <EntranceScope>
            {/* The sheet is a white card: quiet fills inside it (pills, secondary buttons) take the ground's grey. */}
            <OnCard>
              <ChromeCtx.Provider value={chrome}>{children}</ChromeCtx.Provider>
            </OnCard>
          </EntranceScope>
        </AccentScope>
      </ThemeBridge>
    );
  };
}

/** The sheet material: the white Calm card (`calm.card`) with 28 px top corners, one solid fill, no outline. */
function SheetBackground({ style }: BottomSheetBackgroundProps) {
  const c = useCalm();
  // The sheet's face with a faint hairline along its rounded top, as the tab bar has.
  return <View pointerEvents="none" style={[style, { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.card, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.hairline }]} />;
}

/** The dim behind the sheet in the ground's colour, fading with it; a tap closes the sheet. */
function SheetBackdrop(props: BottomSheetBackdropProps) {
  const c = useCalm();
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={1} pressBehavior="close" style={[props.style, { backgroundColor: alpha(c.ground, 0.88) }]} />;
}

/**
 * The handle: a 40 × 5 grab bar in `line` over the header grid (44 | title | 44, a round close button on the right),
 * the title in Figtree 600 18/24 ink. The whole of it drags.
 */
function SheetHandle() {
  const c = useCalm();
  const { title, description, close } = useChrome();
  return (
    <View>
      <View style={{ alignSelf: "center", marginTop: 10, width: 36, height: 4, borderRadius: 2, backgroundColor: c.hairline }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 }}>
        <View style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Txt size={18} lineHeight={24} weight={600} align="center" style={{ color: c.ink }}>
            {title}
          </Txt>
          {description && (
            <Txt size={14} lineHeight={19} align="center" style={{ color: c.sub, marginTop: 2 }}>
              {description}
            </Txt>
          )}
        </View>
        <Button variant="secondary" size="icon-touch" onPress={close} accessibilityLabel="Close">
          <X size={20} color={c.ink} strokeWidth={2} />
        </Button>
      </View>
    </View>
  );
}

/** The stacked actions, pinned to the foot of the sheet (over the keyboard while it is open). */
function SheetFooter({ animatedFooterPosition }: BottomSheetFooterProps) {
  const c = useCalm();
  const { footer, bottom, footerHeight } = useChrome();
  const onLayout = React.useCallback((e: LayoutChangeEvent) => footerHeight.set(e.nativeEvent.layout.height), [footerHeight]);
  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition}>
      <View onLayout={onLayout} style={{ gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(bottom, 16), backgroundColor: c.card }}>
        {footer}
      </View>
    </BottomSheetFooter>
  );
}

// --- Keyboard ---

const SHOWN = KEYBOARD_STATUS.SHOWN;
const HIDDEN = KEYBOARD_STATUS.HIDDEN;

/**
 * Drives the sheet's keyboard behaviour from react-native-keyboard-controller: when the keyboard starts to open, the
 * sheet rises by its height over the same time (`keyboardBehavior="interactive"`; past the status bar it shrinks its
 * scroll area instead), and settles back as it closes. gorhom's own listener only reacts to its BottomSheetTextInput
 * and to Android's after-the-fact `keyboardDidShow`; this covers every TextInput in the sheet, from the first frame.
 */
function KeyboardBridge() {
  const { animatedKeyboardState } = useBottomSheetInternal();
  useKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";
        const s = animatedKeyboardState.get();
        if (e.height > 0) {
          if (s.status === SHOWN && s.height === e.height) return;
          animatedKeyboardState.set({ ...s, status: SHOWN, height: e.height, easing: "easeOut", duration: e.duration > 0 ? e.duration : 250 });
        } else if (s.status === SHOWN) {
          animatedKeyboardState.set({ ...s, status: HIDDEN, easing: "easeOut", duration: e.duration > 0 ? e.duration : 200 });
        }
      },
    },
    [animatedKeyboardState],
  );
  return null;
}

/** The scroll offset, tracked on the UI thread, for keeping a focused field in view. */
const OffsetCtx = React.createContext<SharedValue<number> | null>(null);

const RUNNING = ANIMATION_STATUS.RUNNING;
const KEYBOARD_MOVE = ANIMATION_SOURCE.KEYBOARD;
const RESIZE = ANIMATION_SOURCE.SNAP_POINT_CHANGE;

/**
 * gorhom's scroll handlers, plus the offset (a worklet per scroll event, no JS), minus their scroll lock while the
 * sheet moves for the keyboard or a new content height: gorhom pins the scroll view to the top whenever the sheet is
 * not at rest, which is right under a finger dragging the sheet but threw the content back to its top each time the
 * keyboard closed.
 */
const useTrackedScrollHandlers: ScrollEventsHandlersHookType = (ref, contentOffsetY) => {
  const handlers = useScrollEventsHandlersDefault(ref, contentOffsetY);
  const { animatedAnimationState } = useBottomSheetInternal();
  const offset = React.useContext(OffsetCtx);
  const { handleOnScroll: onScroll, handleOnEndDrag: onEndDrag, handleOnMomentumEnd: onMomentumEnd } = handlers;
  const handleOnScroll = React.useCallback(
    (e: NativeScrollEvent, ctx: never) => {
      "worklet";
      offset?.set(e.contentOffset.y);
      const a = animatedAnimationState.get();
      if (a.status === RUNNING && (a.source === KEYBOARD_MOVE || a.source === RESIZE)) return;
      onScroll?.(e, ctx);
    },
    [onScroll, offset, animatedAnimationState],
  );
  const handleOnEndDrag = React.useCallback(
    (e: NativeScrollEvent, ctx: never) => {
      "worklet";
      const a = animatedAnimationState.get();
      if (a.status === RUNNING && (a.source === KEYBOARD_MOVE || a.source === RESIZE)) return;
      onEndDrag?.(e, ctx);
    },
    [onEndDrag, animatedAnimationState],
  );
  const handleOnMomentumEnd = React.useCallback(
    (e: NativeScrollEvent, ctx: never) => {
      "worklet";
      const a = animatedAnimationState.get();
      if (a.status === RUNNING && (a.source === KEYBOARD_MOVE || a.source === RESIZE)) return;
      onMomentumEnd?.(e, ctx);
    },
    [onMomentumEnd, animatedAnimationState],
  );
  return { ...handlers, handleOnScroll, handleOnEndDrag, handleOnMomentumEnd };
};

// --- Content ---

type ContentProps = { children: React.ReactNode; cacheKey: string | null; estimate: number; footer: boolean; keyboardGap: number; bottom: number };

/**
 * The scroll area. Its first frame is light (a box of the height the content had last time) so the slide starts at
 * once and never waits on rendering; the content mounts once the sheet has settled and fades in over 160 ms.
 */
function SheetContent({ children, cacheKey, estimate, footer, keyboardGap, bottom }: ContentProps) {
  const { footerHeight } = useChrome();
  const { animatedIndex } = useBottomSheetInternal();
  const [ready, setReady] = React.useState(false);
  const markReady = React.useCallback(() => setReady(true), []);
  useAnimatedReaction(
    () => animatedIndex.value >= OPENED_AT,
    (opened, was) => {
      if (opened && !was) scheduleOnRN(markReady);
    },
    [markReady],
  );
  const [fade] = React.useState(() => (reduceMotionNow() ? null : { animationName: CONTENT_IN, animationDuration: 160, animationTimingFunction: "ease-out" as const }));

  const scroll = React.useRef<Scroller | null>(null);
  const content = React.useRef<View>(null);
  const offset = useSharedValue(0);
  const [atTop] = React.useState(() => new Set<HostInput>());
  // The field is kept clear of the footer, which floats over the scroll view's foot.
  const hiddenBelow = React.useCallback(() => footerHeight.get(), [footerHeight]);
  const reveal = useKeepFocusedInputVisible({ scroll, content, offset, gap: keyboardGap, atTop, hiddenBelow });
  // Once more after the sheet's own rise (a spring that can outlast the keyboard) has settled.
  const later = React.useCallback(() => {
    setTimeout(reveal, 360);
  }, [reveal]);
  useKeyboardHandler(
    {
      onEnd: (e) => {
        "worklet";
        if (e.height > 0) scheduleOnRN(later);
      },
    },
    [later],
  );
  const onLayout = React.useCallback(
    (e: LayoutChangeEvent) => {
      if (ready && cacheKey) lastHeight.set(cacheKey, e.nativeEvent.layout.height);
      // Content that grows over the keyboard (a behaviour added above its field, an error under it) can push the
      // focused field under the footer: keep it in view.
      if (KeyboardController.isVisible()) reveal();
    },
    [ready, cacheKey, reveal],
  );

  return (
    <>
      <KeyboardBridge />
      <OffsetCtx.Provider value={offset}>
        <BottomSheetScrollView
          ref={scroll as never}
          keyboardShouldPersistTaps="handled"
          scrollEventsHandlersHook={useTrackedScrollHandlers}
          enableFooterMarginAdjustment={footer}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: footer ? 16 : Math.max(bottom, 16) }}
        >
          <View ref={content} collapsable={false} onLayout={onLayout}>
            <AtTop.Provider value={atTop}>{ready ? <Animated.View style={fade}>{children}</Animated.View> : <View style={{ height: estimate }} />}</AtTop.Provider>
          </View>
        </BottomSheetScrollView>
      </OffsetCtx.Provider>
    </>
  );
}

/**
 * Tasks (check-in, vital and contributor detail) as a bottom drawer (spec §4.8, the web's ResponsiveSheet on a
 * phone), Calm: the white card with 28 px top corners and no outline, a 40 × 5 grab handle in `line`, a round close
 * button at the right, the centred title in Figtree 600 18/24, stacked actions in the footer, over a ground-coloured
 * dim.
 *
 * Built on @gorhom/bottom-sheet (Reanimated + Gesture Handler), in the app's own window: it springs open, follows a
 * drag and closes on a downward fling (or a tap on the dim, the X, Android's back), sized to its content up to 92 %
 * of the screen (`tall`: 92 % whatever the content). Every frame of the motion runs on the UI thread.
 *
 * Over the keyboard: the sheet rises with it, shrinking its scroll area when it would pass the status bar, so the
 * footer's actions stay above the keyboard; the focused field is then scrolled into view above the footer.
 */
export function BottomSheet({ open, onClose, title, description, children, footer, size = "default", keyboardGap = 16 }: BottomSheetProps) {
  const theme = useTheme();
  const accent = useScreenAccent();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ref = React.useRef<BottomSheetModal>(null);
  const tall = size === "tall";
  const topInset = insets.top + 8;
  const maxH = Math.round(height * 0.92);

  // The latest props, for callbacks that outlive a render (gorhom's, the back button's).
  const latest = React.useRef({ open, onClose });
  React.useLayoutEffect(() => {
    latest.current = { open, onClose };
  });
  const close = React.useCallback(() => latest.current.onClose(), []);

  const footerHeight = useSharedValue(0);
  const chrome: Chrome = { theme, accent, title, description, footer, close, bottom: insets.bottom, footerHeight };
  const [store] = React.useState(() => createStore<Chrome | null>(null));
  React.useLayoutEffect(() => store.set(chrome));
  const [Container] = React.useState(() => makeContainer(store));

  // Shown while `open`; closing animates out and unmounts the content.
  const presented = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) ref.current?.dismiss();
  }, [open]);

  // TalkBack stays in the sheet: the app under it is hidden from accessibility services while it is open.
  useCoverLayer(open);

  // Android's back closes the sheet first.
  React.useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current.onClose();
      return true;
    });
    return () => sub.remove();
  }, [open]);

  // A drag down or a tap on the dim starts the close: tell the owner at once, so its state follows the sheet.
  const onAnimate = React.useCallback((_from: number, to: number) => {
    if (to === -1 && latest.current.open) latest.current.onClose();
  }, []);
  const onDismiss = React.useCallback(() => {
    presented.current = false;
    // The owner kept it open (a save in progress declines the close): bring it back.
    if (latest.current.open) {
      presented.current = true;
      requestAnimationFrame(() => ref.current?.present());
    }
  }, []);

  // Stable: a new array would make gorhom re-derive its detents on every render of the owner.
  const snapPoints = React.useMemo(() => (tall ? [Math.min(maxH, height - topInset)] : undefined), [tall, maxH, height, topInset]);
  const cacheKey = tall ? null : title;
  const estimate = tall ? 0 : (lastHeight.get(title) ?? Math.round(maxH * FIRST_GUESS));

  return (
    <BottomSheetModal
      ref={ref}
      containerComponent={Container}
      enableDynamicSizing={!tall}
      snapPoints={snapPoints}
      maxDynamicContentSize={maxH}
      topInset={topInset}
      animationConfigs={SPRING}
      enablePanDownToClose
      // No upward over-drag: its rubber band re-lays out the content on every frame of every slide.
      enableOverDrag={false}
      overDragResistanceFactor={0}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture
      backdropComponent={SheetBackdrop}
      backgroundComponent={SheetBackground}
      handleComponent={SheetHandle}
      footerComponent={footer ? SheetFooter : undefined}
      onAnimate={onAnimate}
      onDismiss={onDismiss}
      accessibilityLabel={title}
    >
      <SheetContent cacheKey={cacheKey} estimate={estimate} footer={!!footer} keyboardGap={keyboardGap} bottom={insets.bottom}>
        {children}
      </SheetContent>
    </BottomSheetModal>
  );
}
