// How Halo works `/more/how-it-works` (U21), ported from the web's more/how-it-works/page.tsx: a short intro, then one
// row per score in an inset grouped list (the score's icon square in its family's colour, its name and one-line
// summary), each opening its explainer. The two blocks rise into place as the page opens.
import * as React from "react";
import { View } from "react-native";
import { DetailShell } from "@/ui";
import { RiseEach } from "@/ui/motion/Rise";
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
        <View style={{ gap: 20 }}>
          <RiseEach>
            <Sentence size={16} style={{ paddingHorizontal: 4, marginTop: -8 }}>
              What goes into each score, how it is weighted, what its bands mean and what it cannot know. Every number comes from Halo’s own code.
            </Sentence>
            <LinkList title="Scores" rows={SCORE_DOCS.map((d) => ({ ...scoreLook(d.slug), label: d.name, description: d.summary, href: `/more/how-it-works/${d.slug}` }))} />
          </RiseEach>
        </View>
      }
    />
  );
}
