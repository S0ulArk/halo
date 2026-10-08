// The way into Live Workout from Home's "Today's activities" card: a card-foot button beside "+ Add activity".
import * as React from "react";
import { Activity } from "lucide-react-native";
import { CardButton } from "@/screens/home/controls";

export function LiveWorkoutButton({ go }: { go: (href: string) => void }) {
  return <CardButton icon={Activity} label="Live workout" onPress={() => go("/workout-live")} />;
}
