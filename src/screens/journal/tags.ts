// The check-in's behaviour groups and icons, shared by the check-in sheet and More › Behaviours (the web's src/lib/journal.ts).
import { Bath, Coffee, Flower2, Plane, Smartphone, StretchHorizontal, Tag, Thermometer, Utensils, Wine, type LucideIcon } from "lucide-react-native";
import type { JournalTag } from "@/queries/types";

const ICON: Record<string, LucideIcon> = {
  alcohol: Wine,
  late_caffeine: Coffee,
  late_meal: Utensils,
  screen_in_bed: Smartphone,
  meditation: Flower2,
  stretching: StretchHorizontal,
  sauna: Bath,
  travel: Plane,
  illness: Thermometer,
};
export const tagIcon = (tag: string): LucideIcon => ICON[tag] ?? Tag;

export const TAG_GROUPS: { key: JournalTag["group"]; title: string }[] = [
  { key: "evening", title: "Evening" },
  { key: "recovery", title: "Recovery" },
  { key: "context", title: "Context" },
  { key: "custom", title: "Your behaviours" },
];

/** The add-a-behaviour form's checks, before the action runs (the web's `add` in CheckIn.tsx and Behaviours.tsx). */
export function behaviourNameProblem(name: string, tags: { tag: string; label: string }[]): string | null {
  if (name.length > 32) return "Use 32 characters or fewer.";
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (tags.some((t) => t.tag === key || t.label.toLowerCase() === name.toLowerCase())) return "That behaviour already exists.";
  return null;
}

/** The action's error as the form shows it. */
export const addErrorText = (error: string) =>
  error.startsWith("Tag already exists") ? "That behaviour already exists." : error.startsWith("Too many") ? "You’ve reached the behaviour limit." : "Couldn’t add it. Try again.";
