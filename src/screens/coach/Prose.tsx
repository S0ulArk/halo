// The coach's answer text, ported from Pulse's coach/Prose.tsx and set as Apple Intelligence sets an answer: plain text
// on the ground (no bubble) in iOS's body size, paragraphs, bullet and numbered lists with grey markers, **bold** in
// semibold. Built from parsed strings into Text, so model output is never interpreted as markup. Selectable, so a long
// press copies it. Memoised on the text, so a streaming answer re-renders only while its own words change.
import * as React from "react";
import { View } from "react-native";
import { parseProse, type Span } from "@/coach/prose";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";

/** iOS's body: 16 px on a 24 px line, roomy enough for a long answer. */
const SIZE = 16;
const LINE = 24;

function Spans({ spans }: { spans: Span[] }) {
  const c = useCalm();
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <Txt key={i} size={SIZE} lineHeight={LINE} weight={600} style={{ color: c.ink }}>
            {s.text}
          </Txt>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

/** Paragraphs 12 px apart; list items 6 px apart, their bullets and numbers in grey in a fixed gutter. */
export const Prose = React.memo(function Prose({ text }: { text: string }) {
  const c = useCalm();
  const blocks = React.useMemo(() => parseProse(text), [text]);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <Txt key={i} size={SIZE} lineHeight={LINE} selectable style={{ color: c.ink }}>
            <Spans spans={b.spans} />
          </Txt>
        ) : (
          <View key={i} style={{ gap: 6 }}>
            {b.items.map((item, k) => (
              <View key={k} style={{ flexDirection: "row" }}>
                <Txt size={SIZE} lineHeight={LINE} style={[b.kind === "ul" ? null : font.numeric(600), { width: b.kind === "ul" ? 18 : 24, color: c.sub }]}>
                  {b.kind === "ul" ? "•" : `${k + 1}.`}
                </Txt>
                <Txt size={SIZE} lineHeight={LINE} selectable style={{ flex: 1, paddingLeft: 4, color: c.ink }}>
                  <Spans spans={item} />
                </Txt>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
});
