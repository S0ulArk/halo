// The ways into Breathe and Live Workout from screens that aren't theirs: the Stress screen's card and More's rows.
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { Activity, ChevronRight, Wind } from "lucide-react-native";
import type { LinkListRow } from "@/screens/more/LinkList";
import { CalmCard, useCalm } from "@/screens/settings/calmKit";

/** More's "Live" group: both sessions that run on the band's live heart rate. */
export const LIVE_LINKS: LinkListRow[] = [
  { icon: Wind, label: "Breathe", description: "Paced breathing, with HRV before and after", href: "/breathe" },
  { icon: Activity, label: "Live workout", description: "Strain Coach on your band’s live heart rate", href: "/workout-live" },
];

/** The Stress screen's way to Breathe: a tappable lavender card (stress's family), its sentence in full. */
export function BreatheCard() {
  const c = useCalm();
  const router = useRouter();
  return (
    <CalmCard
      tint="lavender"
      icon={Wind}
      title="Breathe"
      subtitle="A few minutes of slow, paced breathing to settle. With your band live, see your heart rate fall and your HRV before and after."
      right={<ChevronRight size={20} color={c.tintInk.lavender} strokeWidth={2} />}
      onPress={() => router.push("/breathe" as Href)}
    />
  );
}
