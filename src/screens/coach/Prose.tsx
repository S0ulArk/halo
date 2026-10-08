// The coach's answer text, ported from Pulse's coach/Prose.tsx: paragraphs, bullet and numbered lists, **bold**.
// Built from parsed strings into Text, so model output is never interpreted as markup. Selectable, so a long press
// copies it.
import * as React from "react";
import { View } from "react-native";
import { parseProse, type Span } from "@/coach/prose";
import { Txt } from "@/ui";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";

function Spans({ spans }: { spans: Span[] }) {
  const c = useCalm();
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <Txt key={i} role="body" size={15} lineHeight={24} weight={600} style={{ color: c.ink }}>
            {s.text}
          </Txt>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

/** `space-y-3 text-[15px] leading-6` in ink; lists `space-y-1.5`, bullets `pl-5`, numbers `pl-6`, faint markers. */
export function Prose({ text }: { text: string }) {
  const c = useCalm();
  const blocks = React.useMemo(() => parseProse(text), [text]);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <Txt key={i} role="body" size={15} lineHeight={24} selectable style={{ color: c.ink }}>
            <Spans spans={b.spans} />
          </Txt>
        ) : (
          <View key={i} style={{ gap: 6 }}>
            {b.items.map((item, k) => (
              <View key={k} style={{ flexDirection: "row" }}>
                <Txt role="body" size={15} lineHeight={24} style={[b.kind === "ul" ? null : font.numeric(600), { width: b.kind === "ul" ? 20 : 24, color: c.faint }]}>
                  {b.kind === "ul" ? "•" : `${k + 1}.`}
                </Txt>
                <Txt role="body" size={15} lineHeight={24} selectable style={{ flex: 1, paddingLeft: 4, color: c.ink }}>
                  <Spans spans={item} />
                </Txt>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
