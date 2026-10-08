// "Add a behaviour": the custom-tag form at the foot of the check-in sheet and of More › Behaviours.
import * as React from "react";
import { TextInput, View } from "react-native";
import { useApp } from "@/state/app";
import { Txt } from "@/ui";
import { CalmButton, useCalm } from "../settings/calmKit";
import { addCustomTag, type ActionCtx } from "./actions";
import { TextField } from "./controls";
import { bumpJournal } from "./state";
import { addErrorText, behaviourNameProblem } from "./tags";

/** The actions' context from the app: null until the store and profile exist. */
export function useActionCtx(): ActionCtx | null {
  const { store, profile, timeZone } = useApp();
  return React.useMemo(() => (store && profile ? { store, profile, timeZone } : null), [store, profile, timeZone]);
}

export function AddBehaviour({ tags, onAdded, divided }: { tags: { tag: string; label: string }[]; onAdded: (tag: string, label: string) => void; divided?: boolean }) {
  const c = useCalm();
  const actx = useActionCtx();
  const input = React.useRef<TextInput>(null);
  const [label, setLabel] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  // An invalid name keeps focus on the field, so the error under it is fixable in place.
  const invalid = (message: string) => {
    setAddError(message);
    input.current?.focus();
  };

  const add = async () => {
    const name = label.trim();
    if (!name || adding) return;
    const problem = behaviourNameProblem(name, tags);
    if (problem) return invalid(problem);
    if (!actx) return invalid("Couldn’t add it. Try again.");
    setAdding(true);
    const r = await addCustomTag(actx, { label: name }).catch(() => ({ ok: false as const, error: "network" }));
    setAdding(false);
    if (!r.ok) return invalid(addErrorText(r.error));
    setAddError(null);
    setLabel("");
    bumpJournal();
    onAdded(r.data.tag, name);
  };

  return (
    <View style={[{ marginTop: 16, gap: 8 }, divided && { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 16 }]}>
      <Txt size={14} lineHeight={19} weight={600} nativeID="new-behaviour-label" style={{ color: c.ink, paddingHorizontal: 4 }}>
        Add a behaviour
      </Txt>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextField
          ref={input}
          value={label}
          onChangeText={(t) => {
            setLabel(t);
            setAddError(null);
          }}
          placeholder="e.g. Cold shower…"
          autoComplete="off"
          autoCapitalize="sentences"
          maxLength={32}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          accessibilityLabel="Add a behaviour"
          accessibilityLabelledBy="new-behaviour-label"
          invalid={!!addError}
          style={{ flex: 1 }}
        />
        {/* "Add" fits beside the field on a phone; the name says what it adds. */}
        <CalmButton onPress={() => void add()} disabled={adding || !label.trim()} accessibilityLabel={adding ? undefined : "Add behaviour"}>
          {adding ? "Adding…" : "Add"}
        </CalmButton>
      </View>
      {addError ? (
        <Txt size={13} lineHeight={18} accessibilityRole="alert" style={{ color: c.tintInk.rose, paddingHorizontal: 4 }}>
          {addError}
        </Txt>
      ) : null}
    </View>
  );
}
