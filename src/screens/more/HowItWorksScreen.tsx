// How Halo works `/more/how-it-works` (U21), ported from the web's more/how-it-works/page.tsx: one row per score in a
// Calm grouped list (the score's icon in its family's pastel, its name and one-line summary), each opening its explainer.
import * as React from "react";
import { View } from "react-native";
import { DetailShell } from "@/ui";
import { useBack } from "../detail/nav";
import { Sentence } from "../settings/calmKit";
import { SCORE_DOCS } from "./howItWorksContent";
import { LinkList } from "./LinkList";
import { scoreLook } from "./scoreLook";

export default function HowItWorksScreen() {
  const onBack = useBack("/more");
  return (
    <DetailShell
      title="How Halo works"
      onBack={onBack}
      primary={
        <View style={{ gap: 24 }}>
          <Sentence size={15} style={{ paddingHorizontal: 4 }}>
            What goes into each score, how it is weighted, what its bands mean and what it cannot know. Every number comes from Halo’s own code.
          </Sentence>
          <LinkList title="Scores" rows={SCORE_DOCS.map((d) => ({ ...scoreLook(d.slug), label: d.name, description: d.summary, href: `/more/how-it-works/${d.slug}` }))} />
        </View>
      }
    />
  );
}
