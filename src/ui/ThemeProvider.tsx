import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import { useColorScheme } from "react-native";
import { gradients, TOKENS, type Gradients, type Scheme, type Tokens } from "./theme";

export type ThemeChoice = "system" | "light" | "dark";

export type Theme = {
  scheme: Scheme;
  /** Every colour token of the active theme. */
  c: Tokens;
  /** Gradient pairs of the active theme. */
  g: Gradients;
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
};

const Ctx = React.createContext<Theme | null>(null);

export const resolveTheme = (choice: ThemeChoice, systemLight: boolean): Scheme =>
  choice === "system" ? (systemLight ? "light" : "dark") : choice;

/** Where the app's provider keeps the choice (per device, as the web keeps it in localStorage). */
export const THEME_KEY = "pulse.theme";
const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

/**
 * Theme choice (Settings › Appearance): system, light or dark. Dark is the default when nothing is chosen.
 * With no `initial` (the app's root provider) the choice is read from and saved to AsyncStorage (`pulse.theme`); a
 * provider given `initial` (the component kit's preview) keeps its choice to itself.
 */
export function ThemeProvider({ initial, children }: { initial?: ThemeChoice; children: React.ReactNode }) {
  const persist = initial === undefined;
  const [choice, setLocal] = React.useState<ThemeChoice>(initial ?? "dark");
  // A pick made before the stored choice is read wins over it.
  const picked = React.useRef(false);
  React.useEffect(() => {
    if (!persist) return;
    let live = true;
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (live && !picked.current && isChoice(v)) setLocal(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [persist]);
  const setChoice = React.useCallback(
    (next: ThemeChoice) => {
      picked.current = true;
      setLocal(next);
      if (persist) AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
    },
    [persist],
  );
  const system = useColorScheme();
  const scheme = resolveTheme(choice, system === "light");
  const value = React.useMemo<Theme>(() => {
    const c = TOKENS[scheme];
    return { scheme, c, g: gradients(c), choice, setChoice };
  }, [scheme, choice, setChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Re-provides a theme read elsewhere: a bottom sheet's content renders at the root's portal host, outside the
 * providers around the screen that declared it (the kit preview's own theme, for one).
 */
export function ThemeBridge({ value, children }: { value: Theme; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `{ scheme, c }`: the active scheme and its tokens. Falls back to dark outside a provider (previews, tests). */
export function useTheme(): Theme {
  const v = React.useContext(Ctx);
  if (v) return v;
  return FALLBACK;
}

const FALLBACK: Theme = { scheme: "dark", c: TOKENS.dark, g: gradients(TOKENS.dark), choice: "dark", setChoice: () => {} };
