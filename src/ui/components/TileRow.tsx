// One row of a two-column tile grid (Health Monitor's vitals, an activity's key statistics, My Dashboard, the goal
// tiles), so the tiles line up: the row's tiles stretch to one height, and their labels (TileLabel) all take the
// tallest label's height, so the numbers under them sit on one line however a name wraps.
import * as React from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

type RowSync = { min: number; report: (id: string, height: number) => void; drop: (id: string) => void };

const Sync = React.createContext<RowSync | null>(null);

/**
 * The row: each child in an equal column (one child spans the row), stretched to the row's height. A tile fills its
 * column with `flexGrow: 1`; a label wrapped in TileLabel shares the tallest label's height with the others.
 */
export function TileRow({ children, gap = 12, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const report = React.useCallback((id: string, h: number) => setHeights((s) => (s[id] === h ? s : { ...s, [id]: h })), []);
  const drop = React.useCallback(
    (id: string) =>
      setHeights((s) => {
        if (!(id in s)) return s;
        const next = { ...s };
        delete next[id];
        return next;
      }),
    [],
  );
  const min = Math.max(0, ...Object.values(heights));
  const sync = React.useMemo(() => ({ min, report, drop }), [min, report, drop]);
  const cells = React.Children.toArray(children).filter(Boolean);
  return (
    <Sync.Provider value={sync}>
      <View style={[{ flexDirection: "row", gap }, style]}>
        {cells.map((cell, i) => (
          <View key={React.isValidElement(cell) && cell.key != null ? cell.key : i} style={{ flex: 1, minWidth: 0 }}>
            {cell}
          </View>
        ))}
      </View>
    </Sync.Provider>
  );
}

/**
 * A tile's label (its name, wrapping, never cut): inside a TileRow it is as tall as the row's tallest label, so what
 * follows it starts at one height in every tile of the row; anywhere else it is drawn as is.
 */
export function TileLabel({ children }: { children: React.ReactNode }) {
  const sync = React.useContext(Sync);
  const id = React.useId();
  const report = sync?.report;
  const drop = sync?.drop;
  // A tile that leaves the row takes its height with it.
  React.useEffect(() => () => drop?.(id), [drop, id]);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => report?.(id, Math.ceil(e.nativeEvent.layout.height)), [report, id]);
  if (!sync) return <>{children}</>;
  return (
    <View style={{ minHeight: sync.min || undefined }}>
      {/* The label's own height, measured inside the box that takes the row's tallest. */}
      <View onLayout={onLayout}>{children}</View>
    </View>
  );
}
