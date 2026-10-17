// "Tonight's sleep" (spec §7.1) in the iOS look: the recommended bedtime for the chosen goal and the typical wake as two
// big numbers, the bedtime in the Sleep indigo, then the three goals (Peak, Perform, Get by) as an inset list where the
// chosen one carries iOS's blue tick, each with its share of tonight's need and its own bedtime, then the need itself.
import * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlarmClock, Check, Sunset, type LucideIcon } from "lucide-react-native";
import { clock, hmm } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { haptic } from "@/ui/motion/haptics";
import { Num, useSoftFill } from "./calmKit";
import { Txt } from "./Text";

export type SleepPlanKey = "peak" | "perform" | "getby";
export type SleepPlanVM = {
  wakeAt: number;
  needMin: number;
  plans: { key: SleepPlanKey; label: string; bedtimeAt: number; share: number }[];
};

/** The grey label under a big time, led by its small glyph; it wraps rather than being cut. */
function TimeLabel({ icon: Icon, children, right }: { icon: LucideIcon; children: string; right?: boolean }) {
  const c = useCalm();
  return (
    <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 5, justifyContent: right ? "flex-end" : "flex-start" }}>
      <Icon size={14} color={c.tintInk.lavender} strokeWidth={2.2} />
      <Txt size={13} lineHeight={18} style={{ color: c.sub, flexShrink: 1, textAlign: right ? "right" : "left" }}>
        {children}
      </Txt>
    </View>
  );
}

/** One sleep goal as a list row: its name over its share of tonight's need, its bedtime on the right, the tick when chosen. */
function PlanOption({ label, share, bedtime, on, onPress }: { label: string; share: number; bedtime: string; on: boolean; onPress: () => void }) {
  const c = useCalm();
  const pct = Math.round(share * 100);
  return (
    <Pressable
      onPress={() => {
        if (!on) haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}, ${pct} percent of need, bed by ${bedtime}`}
      style={({ pressed }) => ({ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.55 : 1 })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={16} lineHeight={21} color={c.ink}>
          {label}
        </Txt>
        <Txt size={13} lineHeight={18} color={c.sub}>
          <Txt size={13} lineHeight={18} color={c.sub} style={font.numeric(600)}>
            {`${pct}%`}
          </Txt>
          {" of your need"}
        </Txt>
      </View>
      <Txt size={17} lineHeight={22} color={on ? c.tintInk.lavender : c.sub} style={font.numeric(on ? 700 : 500)}>
        {bedtime}
      </Txt>
      <View style={{ width: 20, alignItems: "center" }}>{on && <Check size={19} color={c.teal} strokeWidth={2.8} />}</View>
    </Pressable>
  );
}

/** Home's "Tonight's sleep" body (spec §7.1). */
export function TonightPlan({ plan, timeZone }: { plan: SleepPlanVM; timeZone?: string }) {
  const c = useCalm();
  const fill = useSoftFill();
  const [key, setKey] = React.useState<SleepPlanKey>("peak");
  const chosen = plan.plans.find((p) => p.key === key) ?? plan.plans[0];
  const bed = clock(chosen.bedtimeAt, timeZone);
  const wake = clock(plan.wakeAt, timeZone);
  return (
    <View style={{ gap: 16 }}>
      <View accessible accessibilityLabel={`Bed by ${bed} for ${chosen.label.toLowerCase()}. Typical wake ${wake}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Num value={bed} size={36} color={c.tintInk.lavender} />
          <TimeLabel icon={Sunset}>Recommended bedtime</TimeLabel>
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
          <Num value={wake} size={36} />
          <TimeLabel icon={AlarmClock} right>
            Typical wake
          </TimeLabel>
        </View>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Sleep goal" style={{ borderRadius: 14, backgroundColor: fill, overflow: "hidden" }}>
        {plan.plans.map((p, i) => (
          <React.Fragment key={p.key}>
            {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 14, backgroundColor: c.line }} />}
            <PlanOption label={p.label} share={p.share} bedtime={clock(p.bedtimeAt, timeZone)} on={p.key === chosen.key} onPress={() => setKey(p.key)} />
          </React.Fragment>
        ))}
      </View>
      <Txt size={15} lineHeight={20} color={c.sub}>
        {"Need tonight: "}
        <Txt size={15} lineHeight={20} color={c.ink} style={font.numeric(700)}>
          {hmm(plan.needMin)}
        </Txt>
      </Txt>
    </View>
  );
}
