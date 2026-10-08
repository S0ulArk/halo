// One score's explainer `/more/how-it-works/[score]` (U21), ported from the web's more/how-it-works/[score]/page.tsx:
// the summary and a way to the score's screen, then What goes in, How it is weighted, What the bands mean and Limits,
// then the previous and next scores.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react-native";
import { DetailShell, EmptyState, Txt } from "@/ui";
import { font } from "@/ui/fonts";
import { useBack } from "../detail/nav";
import { Caption, CalmButton, Hairline, IconTile, Sentence, Surface, Title, useCalm } from "../settings/calmKit";
import { SCORE_DOCS, type HowSection } from "./howItWorksContent";
import { scoreLook } from "./scoreLook";

/** A detail this short sits beside its term ("HRV  55%"); a sentence goes under it. */
const SHORT = 24;
/** A detail that is only a number ("55%", "−0.08"): set in the numeric face. */
const NUMBER = /^[\d.,%+\-−–\s\u00a0]+$/;

function Section({ s }: { s: HowSection }) {
  const c = useCalm();
  return (
    <Surface gap={12}>
      <Title header>{s.title}</Title>
      {s.paragraphs?.map((p) => (
        <Sentence key={p} size={15}>
          {p}
        </Sentence>
      ))}
      {s.rows && (
        <View>
          {s.rows.map((r, i) => {
            const short = r.detail.length <= SHORT;
            const number = short && NUMBER.test(r.detail);
            return (
              <React.Fragment key={r.term}>
                {i > 0 || s.paragraphs?.length ? <Hairline /> : null}
                <View style={[{ paddingVertical: 12 }, short ? { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 } : { gap: 2 }]}>
                  <Txt size={15} lineHeight={20} weight={600} style={[{ color: c.ink }, short ? { flexShrink: 1 } : null]}>
                    {r.term}
                  </Txt>
                  {number ? (
                    <Txt size={18} lineHeight={22} align="right" style={[font.numeric(700), { color: c.ink, flexShrink: 0 }]}>
                      {r.detail}
                    </Txt>
                  ) : (
                    <Txt size={14} lineHeight={19} align={short ? "right" : undefined} style={[{ color: c.sub }, short ? { flexShrink: 1 } : null]}>
                      {r.detail}
                    </Txt>
                  )}
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}
    </Surface>
  );
}

function Step({ dir, name, onPress }: { dir: "prev" | "next"; name: string; onPress: () => void }) {
  const c = useCalm();
  const next = dir === "next";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${next ? "Next" : "Previous"}: ${name}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: next ? "flex-end" : "flex-start",
        gap: 8,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: c.card,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {!next && <ChevronLeft size={20} color={c.teal} strokeWidth={2} />}
      <View style={{ minWidth: 0, flexShrink: 1, alignItems: next ? "flex-end" : "flex-start", gap: 2 }}>
        <Caption>{next ? "Next" : "Previous"}</Caption>
        <Txt size={15} lineHeight={20} weight={600} align={next ? "right" : "left"} style={{ color: c.ink }}>
          {name}
        </Txt>
      </View>
      {next && <ChevronRight size={20} color={c.teal} strokeWidth={2} />}
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
        <Surface tint={look.tint} gap={16}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
            <IconTile icon={look.icon} tint={look.tint} on="tint" />
            <Txt size={17} lineHeight={23} weight={500} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
              {doc.summary}
            </Txt>
          </View>
          {!!href && (
            <View style={{ alignItems: "flex-start" }}>
              <CalmButton variant="secondary" size="md" onPress={() => router.push(href as Href)} icon={look.icon}>
                {`Open ${doc.name}`}
              </CalmButton>
            </View>
          )}
        </Surface>
      }
      secondary={doc.sections.map((s) => (
        <Section key={s.title} s={s} />
      ))}
      footer={
        <View style={{ gap: 16 }}>
          <Sentence size={13} style={{ paddingHorizontal: 4 }}>
            Not a medical device. Halo’s scores are estimates from a wrist sensor, for personal use, not a diagnosis.
          </Sentence>
          <View accessibilityLabel="Other scores" style={{ flexDirection: "row", gap: 8 }}>
            {prev ? <Step dir="prev" name={prev.name} onPress={() => go(prev.slug)} /> : <View style={{ flex: 1 }} />}
            {next && <Step dir="next" name={next.name} onPress={() => go(next.slug)} />}
          </View>
        </View>
      }
    />
  );
}
