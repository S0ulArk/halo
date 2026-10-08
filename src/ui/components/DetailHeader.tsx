import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, X } from "lucide-react-native";
import { useCalm } from "@/ui/calm";
import { Button } from "./Button";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { InfoButton, type InfoContent } from "./InfoButton";
import { Txt } from "./Text";

/** The hairline under every header, in px. Calm headers have none: kept for API compatibility (layout offsets). */
export const HEADER_FADE = 1;

/**
 * The header's bottom edge. Calm headers sit on the solid ground with no hairline, so this draws nothing; the
 * component (and its props) stay for API compatibility.
 */
export function HeaderFade(_props: { color: string; style?: StyleProp<ViewStyle> }) {
  return null;
}

/**
 * The sticky header frame: a solid bar in the Calm ground, from under the status bar to the bottom of its content,
 * nothing scrolling under it showing through, and no hairline. Place it above the ScrollView.
 */
export function HeaderFrame({ children, ground, style }: { children: React.ReactNode; ground?: "default" | "healthspan"; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const insets = useSafeAreaInsets();
  // Healthspan's ground is the same warm grey now; the prop stays for API compatibility.
  void ground;
  return (
    <View style={[{ zIndex: 20 }, style]}>
      <View style={{ backgroundColor: c.ground, paddingTop: insets.top }}>{children}</View>
    </View>
  );
}

/** A three-slot header row: left, centred title, right. 44 px slots with 6 px of air above and below, 12 px sides. */
export function HeaderRow({ left, center, right, height = 44, style }: { left?: React.ReactNode; center: React.ReactNode; right?: React.ReactNode; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ minHeight: height + 12, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 }, style]}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" }}>{left}</View>
      <View style={{ flexShrink: 1, alignItems: "center" }}>{center}</View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>{right}</View>
    </View>
  );
}

/** The header's title: Figtree 600 18/24 in ink, up to two lines (never cut short). */
function HeaderTitle({ children, align = "center" }: { children: string; align?: "center" | "left" }) {
  const c = useCalm();
  return (
    <Txt size={18} lineHeight={24} weight={600} numberOfLines={2} align={align} style={{ color: c.ink }}>
      {children}
    </Txt>
  );
}

/** The line under a header title ("Next update in 7 days", an activity's time range): 13/18 grey. */
function HeaderSubtitle({ children, align = "center" }: { children: string; align?: "center" | "left" }) {
  const c = useCalm();
  return (
    <Txt size={13} lineHeight={18} weight={500} numberOfLines={2} align={align} style={{ color: c.sub, fontVariant: ["tabular-nums"] }}>
      {children}
    </Txt>
  );
}

export type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  info?: InfoContent;
  /** Back (or close). A tab root has none: it passes `lead` (the avatar) instead. */
  onBack?: () => void;
  /** In place of the back button: the avatar on a tab root (Sleep, Activity). */
  lead?: React.ReactNode;
  /** Recovery, Strain, Sleep: the date is the title, with day chevrons beside it (spec §4.4). */
  dateTitle?: DateSwitcherProps;
  /** `close`: an X instead of the back chevron, for modal-style screens (Settings). */
  dismiss?: "back" | "close";
  /** `start`: back, an optional 24 px icon, then the title over the subtitle, all left-aligned (Activity). */
  align?: "center" | "start";
  titleIcon?: React.ReactNode;
  /** The bar's right side in place of the info button. */
  action?: React.ReactNode;
  ground?: "default" | "healthspan";
};

/**
 * Back (or close) and info as 44 px white round buttons on the ground, the title (or the date pill) centred between
 * them (spec §4.4).
 */
export function DetailHeaderRow({ title, subtitle, info, onBack, lead, dateTitle, dismiss = "back", align = "center", titleIcon, action }: DetailHeaderProps) {
  const c = useCalm();
  const backButton = lead ?? (
    <Button variant="ghost" size="icon-touch" onPress={onBack} accessibilityLabel={dismiss === "close" ? "Close" : "Back"} style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.edge }}>
      {dismiss === "close" ? <X size={20} color={c.ink} strokeWidth={2} /> : <ChevronLeft size={24} color={c.ink} strokeWidth={2} style={{ marginLeft: -2 }} />}
    </Button>
  );
  if (align === "start")
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12, paddingVertical: 6, minHeight: 56 }}>
        <View style={{ height: 44, justifyContent: "center" }}>{backButton}</View>
        {titleIcon && <View style={{ height: 44, width: 28, alignItems: "center", justifyContent: "center" }}>{titleIcon}</View>}
        <View style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" }}>
          <HeaderTitle align="left">{title}</HeaderTitle>
          {/* The activity's time range under its name (spec §11 F14). */}
          {subtitle && <HeaderSubtitle align="left">{subtitle}</HeaderSubtitle>}
        </View>
        {info && (
          <View style={{ minHeight: 44, justifyContent: "center" }}>
            <InfoButton info={info} label={title} variant="header" />
          </View>
        )}
      </View>
    );
  const sub = !!subtitle && !dateTitle;
  return (
    <HeaderRow
      left={backButton}
      center={
        <View style={{ alignItems: "center" }}>
          {dateTitle ? (
            <DateSwitcher {...dateTitle} placement="header" />
          ) : (
            <>
              <HeaderTitle>{title}</HeaderTitle>
              {/* "Next update in 7 days" (spec §11 F15). */}
              {sub && <HeaderSubtitle>{subtitle!}</HeaderSubtitle>}
            </>
          )}
        </View>
      }
      right={action ?? (info && <InfoButton info={info} label={title} variant="header" />)}
    />
  );
}

/** Detail-route header (spec §4.4): a plain pinned bar on the Calm ground, no hairline; nothing collapses. */
export function DetailHeader(props: DetailHeaderProps) {
  return (
    <HeaderFrame ground={props.ground}>
      <DetailHeaderRow {...props} />
    </HeaderFrame>
  );
}

/** Health, Journal and More (spec §4.3 "Other tab roots"): centred title, a right slot (SyncStatus), optional date pill under it. */
export function TitleHeader({ title, right, dateSwitcher, onBack, lead }: { title: string; right?: React.ReactNode; dateSwitcher?: DateSwitcherProps; onBack?: () => void; lead?: React.ReactNode }) {
  const c = useCalm();
  // A page reached from elsewhere (the journal, More) gets the way back; a tab root gets the avatar (`lead`).
  const left = onBack ? (
    <Button variant="ghost" size="icon-touch" onPress={onBack} accessibilityLabel="Back" style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.edge }}>
      <ChevronLeft size={24} color={c.ink} strokeWidth={2} style={{ marginLeft: -2 }} />
    </Button>
  ) : lead;
  return (
    <HeaderFrame>
      <HeaderRow style={{ paddingHorizontal: left ? 12 : 16 }} left={left} center={<HeaderTitle>{title}</HeaderTitle>} right={right} />
      {dateSwitcher && (
        <View style={{ alignItems: "center", paddingBottom: 8 }}>
          <DateSwitcher {...dateSwitcher} />
        </View>
      )}
    </HeaderFrame>
  );
}
