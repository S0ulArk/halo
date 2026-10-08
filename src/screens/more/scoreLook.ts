// Each explained score's icon and Calm family, for the How Halo works list and the explainer's head.
import { Activity, BatteryCharging, BedDouble, BookOpen, CalendarClock, Dumbbell, Flame, Gauge, HeartPulse, Hourglass, ListChecks, Moon, Scale, ShieldCheck, Sparkles, Target, TrendingUp, Waves, type LucideIcon } from "lucide-react-native";
import type { CalmTint } from "@/ui/calm";

const LOOK: Record<string, { icon: LucideIcon; tint: CalmTint }> = {
  recovery: { icon: HeartPulse, tint: "mint" },
  strain: { icon: Flame, tint: "peach" },
  "strain-target": { icon: Target, tint: "peach" },
  sleep: { icon: Moon, tint: "lavender" },
  "sleep-planner": { icon: BedDouble, tint: "lavender" },
  "pulse-age": { icon: Hourglass, tint: "mint" },
  stress: { icon: Waves, tint: "lavender" },
  "energy-bank": { icon: BatteryCharging, tint: "sand" },
  "health-monitor": { icon: ShieldCheck, tint: "rose" },
  fitness: { icon: Activity, tint: "sky" },
  "training-balance": { icon: Scale, tint: "peach" },
  "journal-impact": { icon: ListChecks, tint: "lavender" },
  "sleep-consistency": { icon: CalendarClock, tint: "lavender" },
  "recovery-forecast": { icon: TrendingUp, tint: "mint" },
  "training-load": { icon: Dumbbell, tint: "peach" },
  "hr-recovery": { icon: HeartPulse, tint: "rose" },
  "hrv-status": { icon: HeartPulse, tint: "mint" },
  "training-readiness": { icon: Gauge, tint: "peach" },
  "training-effect": { icon: Sparkles, tint: "peach" },
  "training-status": { icon: TrendingUp, tint: "sky" },
};

/** The score's icon and pastel family (a book in sky for one not listed). */
export const scoreLook = (slug: string): { icon: LucideIcon; tint: CalmTint } => LOOK[slug] ?? { icon: BookOpen, tint: "sky" };
