// One score's explainer `/more/how-it-works/[score]` (U21), ported from the web's more/how-it-works/[score]/page.tsx and
// set as Apple Health sets its "About" articles: the summary on the family's soft card with a way to the score's
// screen, then What goes in, How it is weighted, What the bands mean and Limits as readable cards (a bold title, body
// sentences in ink, term / detail rows), then the disclaimer and the previous and next scores. A weight given as a share
// ("58%") draws a bar of that length in the family's colour; a band named Green, Yellow or Red leads with its dot.
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react-native";
import { DetailShell, EmptyState, Txt } from "@/ui";
import { usePress, usePressStyle } from "@/ui/components/press";
import { font } from "@/ui/fonts";
import { useBack } from "../detail/nav";
import { Caption, CalmButton, Hairline, Sentence, Surface, useCalm, type CalmTint } from "../settings/calmKit";
import { RowIcon } from "../settings/list";
import { SCORE_DOCS, type HowRow, type HowSection } from "./howItWorksContent";
import { scoreLook } from "./scoreLook";

/** A detail this short sits beside its term ("Prime"); a sentence goes under it. */
const SHORT = 24;
/** A detail that is only a number ("−0.08", "3.2"): set in tabular figures. */
const NUMBER = /^[\d.,%+\-−–\s ]+$/;
/** A detail that is a share of the whole ("58%"): drawn as a bar too. */
const SHARE = /^(\d+(?:\.\d+)?)%$/;

/** The dot a Recovery-style band leads with, from its detail's first word. */
function bandDot(detail: string, c: ReturnType<typeof useCalm>): string | null {
  if (/^Green\b/.test(detail)) return c.system.green;
  if (/^Yellow\b/.test(detail)) return c.system.yellow;
  if (/^Red\b/.test(detail)) return c.system.red;
  return null;
}

function TermRow({ r, tint }: { r: HowRow; tint: CalmTint }) {
  const c = useCalm();
  const short = r.detail.length <= SHORT;
  const number = short && NUMBER.test(r.detail);
  const share = SHARE.exec(r.detail);
  const dot = bandDot(r.detail, c);
  return (
    <View accessible accessibilityLabel={`${r.term}: ${r.detail}`} style={{ paddingVertical: 12, gap: share ? 8 : 2 }}>
      <View style={short ? { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 } : { gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
          <Txt size={16} lineHeight={21} weight={600} style={[{ color: c.ink, flexShrink: 1 }, NUMBER.test(r.term) ? font.numeric(600) : null]}>
            {r.term}
          </Txt>
        </View>
        {number ? (
          <Txt size={20} lineHeight={24} align="right" style={[font.numeric(700), { color: share ? c.tintInk[tint] : c.ink, flexShrink: 0 }]}>
            {r.detail}
          </Txt>
        ) : (
          <Txt size={15} lineHeight={21} align={short ? "right" : undefined} style={[{ color: c.sub }, short ? { flexShrink: 1 } : null]}>
            {r.detail}
          </Txt>
        )}
      </View>
      {share ? (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: "hidden" }}>
          <View style={{ width: `${Math.min(100, Number(share[1]))}%`, height: "100%", borderRadius: 3, backgroundColor: c.tintInk[tint] }} />
        </View>
      ) : null}
    </View>
  );
}

function Section({ s, tint }: { s: HowSection; tint: CalmTint }) {
  const c = useCalm();
  return (
    <Surface gap={10} padding={18}>
      <Txt size={20} lineHeight={25} weight={700} accessibilityRole="header" style={{ color: c.ink }}>
        {s.title}
      </Txt>
      {s.paragraphs?.map((p) => (
        <Txt key={p} size={16} lineHeight={23} style={{ color: c.ink }}>
          {p}
        </Txt>
      ))}
      {s.rows && (
        <View style={{ marginTop: s.paragraphs?.length ? 2 : -4 }}>
          {s.rows.map((r, i) => (
            <React.Fragment key={r.term}>
              {i > 0 || s.paragraphs?.length ? <Hairline /> : null}
              <TermRow r={r} tint={tint} />
            </React.Fragment>
          ))}
        </View>
      )}
    </Surface>
  );
}

/** The way to the previous or next score: a card with "Previous" / "Next" over its name, a chevron at its outer edge. */
function Step({ dir, name, onPress }: { dir: "prev" | "next"; name: string; onPress: () => void }) {
  const c = useCalm();
  const next = dir === "next";
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.8 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="link" accessibilityLabel={`${next ? "Next" : "Previous"}: ${name}`} style={{ flex: 1, minWidth: 0 }}>
      <Animated.View style={[{ minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: next ? "flex-end" : "flex-start", gap: 6, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.card }, pressed]}>
        {!next && <ChevronLeft size={20} color={c.teal} strokeWidth={2.4} />}
        <View style={{ minWidth: 0, flexShrink: 1, alignItems: next ? "flex-end" : "flex-start", gap: 2 }}>
          <Caption>{next ? "Next" : "Previous"}</Caption>
          <Txt size={16} lineHeight={21} weight={600} align={next ? "right" : "left"} style={{ color: c.ink }}>
            {name}
          </Txt>
        </View>
        {next && <ChevronRight size={20} color={c.teal} strokeWidth={2.4} />}
      </Animated.View>
    </Pressable>
  );
}

export default function ScoreExplainerScreen() {
  const c = useCalm();
  const router = useRouter();
  const onBack = useBack("/more/how-it-works");
  const { score } = useLocalSearchParams<{ score?: string }>();
  const i = SCORE_DOCS.findIndex((d) => d.slug === score);
  if (i < 0)
    return <DetailShell title="How Halo works" onBack={onBack} primary={<EmptyState icon={CircleAlert} body="There is no explainer for this score." action={{ label: "All scores", onPress: () => router.replace("/more/how-it-works" as Href) }} />} />;
  const doc = SCORE_DOCS[i];
  const look = scoreLook(doc.slug);
  const prev = SCORE_DOCS[i - 1];
  const next = SCORE_DOCS[i + 1];
  const href = doc.href;
  const go = (slug: string) => router.replace(`/more/how-it-works/${slug}` as Href);

  return (
    <DetailShell
      title={doc.name}
      subtitle="How it works"
      onBack={onBack}
      primary={
        <Surface tint={look.tint} gap={16} padding={18}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
            <RowIcon icon={look.icon} tint={look.tint} size={44} />
            <Txt size={18} lineHeight={24} weight={600} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
              {doc.summary}
            </Txt>
          </View>
          {!!href && (
            <View style={{ alignItems: "flex-start" }}>
              <CalmButton variant="primary" size="md" onPress={() => router.push(href as Href)} icon={look.icon}>
                {`Open ${doc.name}`}
              </CalmButton>
            </View>
          )}
        </Surface>
      }
      secondary={doc.sections.map((s) => (
        <Section key={s.title} s={s} tint={look.tint} />
      ))}
      footer={
        <View style={{ gap: 16 }}>
          <Sentence size={13} style={{ paddingHorizontal: 4 }}>
            Not a medical device. Halo’s scores are estimates from a wrist sensor, for personal use, not a diagnosis.
          </Sentence>
          <View accessibilityLabel="Other scores" style={{ flexDirection: "row", gap: 10 }}>
            {prev ? <Step dir="prev" name={prev.name} onPress={() => go(prev.slug)} /> : <View style={{ flex: 1 }} />}
            {next ? <Step dir="next" name={next.name} onPress={() => go(next.slug)} /> : <View style={{ flex: 1 }} />}
          </View>
        </View>
      }
    />
  );
}
