import * as React from "react";
import { Pressable, View } from "react-native";
import { AlarmClock, Sunset, type LucideIcon } from "lucide-react-native";
import { clock, hmm } from "@/lib/format";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { Caption, Num } from "./calmKit";
import { Txt } from "./Text";

export type SleepPlanKey = "peak" | "perform" | "getby";
export type SleepPlanVM = {
  wakeAt: number;
  needMin: number;
  plans: { key: SleepPlanKey; label: string; bedtimeAt: number; share: number }[];
};

/** A caps label under a big time, led by its small icon; it wraps rather than being cut. */
function TimeLabel({ icon: Icon, children, right }: { icon: LucideIcon; children: string; right?: boolean }) {
  const c = useCalm();
  return (
    <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 5, justifyContent: right ? "flex-end" : "flex-start" }}>
      <Icon size={14} color={c.tintInk.lavender} strokeWidth={2} />
      <Caption numberOfLines={2} style={{ flexShrink: 1, textAlign: right ? "right" : "left" }}>
        {children}
      </Caption>
    </View>
  );
}

/** One sleep goal as a row: a radio dot, its name over its share of tonight's need, and its bedtime on the right. */
function PlanOption({ label, share, bedtime, on, onPress }: { label: string; share: number; bedtime: string; on: boolean; onPress: () => void }) {
  const c = useCalm();
  const ink = c.tintInk.lavender;
  const pct = Math.round(share * 100);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}, ${pct} percent of need, bed by ${bedtime}`}
      style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: on ? c.chip : "transparent", opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? ink : c.faint, alignItems: "center", justifyContent: "center" }}>
        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ink }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={16} lineHeight={21} weight={600} color={c.ink}>
          {label}
        </Txt>
        <Txt size={13} lineHeight={18} color={c.sub}>
          <Txt size={13} lineHeight={18} color={c.sub} style={font.numeric(600)}>
            {`${pct}%`}
          </Txt>
          {" of your need"}
        </Txt>
      </View>
      <Txt size={20} lineHeight={24} color={on ? ink : c.sub} style={font.numeric(700)}>
        {bedtime}
      </Txt>
    </Pressable>
  );
}

/**
 * Home's "Tonight's sleep" body (spec §7.1), Calm: the recommended bedtime for the chosen goal and the typical wake as
 * two big numbers with caps labels, the three goals (Peak, Perform, Get by) as rows with their own bedtimes, then
 * tonight's need.
 */
export function TonightPlan({ plan, timeZone }: { plan: SleepPlanVM; timeZone?: string }) {
  const c = useCalm();
  const [key, setKey] = React.useState<SleepPlanKey>("peak");
  const chosen = plan.plans.find((p) => p.key === key) ?? plan.plans[0];
  const bed = clock(chosen.bedtimeAt, timeZone);
  const wake = clock(plan.wakeAt, timeZone);
  return (
    <View style={{ gap: 18 }}>
      <View accessible accessibilityLabel={`Bed by ${bed} for ${chosen.label.toLowerCase()}. Typical wake ${wake}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Num value={bed} size={40} color={c.tintInk.lavender} />
          <TimeLabel icon={Sunset}>Recommended bedtime</TimeLabel>
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
          <Num value={wake} size={40} />
          <TimeLabel icon={AlarmClock} right>
            Typical wake
          </TimeLabel>
        </View>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Sleep goal" style={{ gap: 4 }}>
        {plan.plans.map((p) => (
          <PlanOption key={p.key} label={p.label} share={p.share} bedtime={clock(p.bedtimeAt, timeZone)} on={p.key === chosen.key} onPress={() => setKey(p.key)} />
        ))}
      </View>
      <Txt size={14} lineHeight={19} color={c.sub}>
        {"Need tonight: "}
        <Txt size={14} lineHeight={19} color={c.ink} style={font.numeric(700)}>
          {hmm(plan.needMin)}
        </Txt>
      </Txt>
    </View>
  );
}
