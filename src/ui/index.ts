// The UI kit's public surface. Screens import from "@/ui" and never hand-roll colours or type.
export { ThemeProvider, useTheme, resolveTheme, type Theme, type ThemeChoice } from "./ThemeProvider";
export { DARK, LIGHT, TOKENS, RADIUS, MOTION, gradients, type Tokens, type ColorToken, type Scheme } from "./theme";
export { useAppFonts, font, TABULAR } from "./fonts";
export { Txt, ROLES, useTextStyle, type TextRole, type TxtProps } from "./components/Text";
export { Tag, MetricTags, StatusChip, DeltaMark, ValueUnit, AccentIcon, tagLabel, type TagKind } from "./components/primitives";
export { ACCENT_TOKEN, ACCENT_BACKDROP, METRIC_FAMILY, accentFamily, accentToken, accentColor, AccentScope, useScreenAccent, type AccentFamily } from "./accents";
export {
  EASE,
  ENTER,
  staggerDelay,
  useReduceMotion,
  useAppActive,
  useEntrance,
  FadeIn,
  Stagger,
  EntranceScope,
  useCountUp,
  useCountUpText,
  CountUpText,
  useSlide,
  Reveal,
  usePop,
  type EasingFn,
  type EntranceOptions,
  type FadeInProps,
} from "./motion";
export { Skeleton, SkeletonText } from "./components/Skeleton";
export { MetricState, type MetricMeta } from "./components/MetricState";
export { ReasonPlaceholder, REASON_ICON } from "./components/ReasonPlaceholder";
export { EmptyState } from "./components/EmptyState";
export { Button, type ButtonProps } from "./components/Button";
export { Wordmark, GLYPHS } from "./components/Wordmark";
export { BandIcon } from "./components/BandIcon";
export { Mark } from "./components/Mark";
export { Card, LegendStrip } from "./components/Card";
export { Hatch } from "./components/Hatch";
export { ScoreDial, ScoreDialSkeleton, type ScoreDialProps, type DialSize, type DialVariant } from "./components/ScoreDial";
export { MiniRing, type MiniRingVariant } from "./components/MiniRing";
export { SectionShell, type SectionShellProps } from "./components/SectionShell";
export { InfoButton, InfoDialog, InfoRows, type InfoContent } from "./components/InfoButton";
export { ToggleGroup, type ToggleItem } from "./components/ToggleGroup";
export { Alert } from "./components/Alert";
export { BottomSheet, SheetSection } from "./components/BottomSheet";
export { Sparkline } from "./components/Sparkline";
export { KeyStatRow, KeyStatRowSkeleton, type KeyStatRowProps, type SleepStatus } from "./components/KeyStatRow";
export { TileRow, TileLabel } from "./components/TileRow";
export { ContributorRow, ContributorRowSkeleton, type ContributorRowProps } from "./components/ContributorRow";
export { DriverList, DriverListSkeleton, type DriverItem, type DriverListProps } from "./components/DriverList";
export { TickScale, TickScaleSkeleton, type TickScaleProps } from "./components/TickScale";
export { TrendChart, TrendChartSkeleton, RANGE_DAYS, type TrendChartProps, type TrendPoint, type TrendRange, type TrendSeries } from "./components/TrendChart";
export { StrainRecoveryChart, type StrainRecoveryPoint } from "./components/StrainRecoveryChart";
export { EnergyBankChart, type EnergySeries } from "./components/EnergyBankChart";
export { IntradayHrChart, type HrSeries, type HrZone, type ChartSpan } from "./components/IntradayHrChart";
export { SleepHrChart, type SleepHr } from "./components/SleepHrChart";
export { Hypnogram, HypnogramChart, type HypnogramNight } from "./components/Hypnogram";
export { SleepStages, type SleepStagesNight, type SleepHours } from "./components/SleepStages";
export { ZoneBars, ZONE_COLOR, type ZoneRow, type StackedSegment } from "./components/ZoneBars";
export { ActivityCard, TimelineRow, TimelineSkeleton, distanceText, ACTIVITY_ICON, type ActivityKind, type ActivityCardProps } from "./components/ActivityCard";
export { SleepCard, type SleepCardProps } from "./components/SleepCard";
export { InsightCard, type InsightCardProps } from "./components/InsightCard";
export { HomeInsight, type HomeInsightItem } from "./components/HomeInsight";
export { TonightPlan, type SleepPlanVM } from "./components/TonightPlan";
export { DateSwitcher, stepDay, weekOf, type DateSwitcherProps } from "./components/DateSwitcher";
export { DetailHeader, DetailHeaderRow, HeaderFade, HeaderFrame, HeaderRow, HEADER_FADE, TitleHeader, type DetailHeaderProps } from "./components/DetailHeader";
export { AfterTransition, useAfterTransition } from "./components/AfterTransition";
export { DetailShell, type DetailShellProps } from "./components/DetailShell";
export { PageShell, Ground, type PageShellProps } from "./components/PageShell";
export { HomeHeader, StreakFlame, UserAvatar, type HomeHeaderProps, type HeaderRings } from "./components/HomeHeader";
export { SyncStatus, syncView, type SyncShellStatus } from "./components/SyncStatus";
export { TabBar, TABS, Glass, CheckInAction, Monogram, type TabItem, type TabBarProps } from "./components/TabBar";
export { ChartFigure, Pill, GlowDot, Grid, AxisText } from "./components/ChartFrame";
export { usePress } from "./components/press";
