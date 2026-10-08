import {
  router as rootRouter,
  Stack,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { perf, startLagMonitor } from "@/lib/perf";
import * as React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "@/state/app";
import { ScreenTransition } from "@/state/transition";
import { CoverableContent, OverlayHost } from "@/ui/components/Overlay";
import { useAppFonts } from "@/ui/fonts";
import { ThemeProvider, useTheme } from "@/ui/ThemeProvider";


// Diagnostics: every navigation call is timed from here (src/lib/perf.ts), and JS-thread stalls are logged.
startLagMonitor();
for (const name of ["push", "navigate", "replace", "back"] as const) {
  const original = rootRouter[name] as (...args: unknown[]) => unknown;
  (rootRouter as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
    perf(`nav-${name}`, typeof args[0] === "string" ? args[0] : "");
    return original(...args);
  };
}

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();
  return (
    // Gestures (react-native-gesture-handler) for the bottom sheets' drag, recognised on the UI thread.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Keyboard frames for every screen and sheet (react-native-keyboard-controller): the app is edge to edge, which
            the provider detects, so the window no longer resizes for the keyboard and inputs lift themselves. */}
        <KeyboardProvider>
          <ThemeProvider>
              <AppProvider>
                {/* Dialogs (InfoDialog) render over everything here, sheets included, in the app's own window. */}
                <OverlayHost>
                  {/* Every BottomSheet (@gorhom/bottom-sheet) renders in this provider's host, over the navigator, in the
                    app's own window (no Android Dialog). Inside the theme and app providers, so a sheet's content
                    (drawn at the host, not where it is declared) still reads them; BottomSheet bridges the screen's own. */}
                  <BottomSheetModalProvider>
                    {/* Nothing mounts before the fonts: Android measures text once, so text laid out with the fallback
                      font stays clipped after Figtree arrives. */}
                    {fontsLoaded ? <Gate /> : <Splash />}
                  </BottomSheetModalProvider>
                </OverlayHost>
              </AppProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const screenLayout = ({
  children,
  route,
}: {
  children: React.ReactElement;
  route: { key: string };
}) => <ScreenTransition routeKey={route.key}>{children}</ScreenTransition>;

function Splash() {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.background,
      }}
    >
      <ActivityIndicator color={c.foregroundSecondary} />
    </View>
  );
}

/**
 * The navigator stays mounted once the fonts are in (expo-router can only navigate once it is); a splash covers it
 * while the store opens. Routes the person to onboarding until a profile and a data source exist.
 */
function Gate() {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  const navReady = !!useRootNavigationState()?.key;
  const { c, scheme } = useTheme();

  // The window's own background follows the theme's ground: what shows for a moment at launch, under a sliding screen
  // and behind the system bars is the page's colour, never the dark default.
  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.background).catch(() => {});
  }, [c.background]);

  // Leave onboarding only on the transition out of it, so Profile can still be opened from More later.
  const wasOnboarding = React.useRef(false);
  React.useEffect(() => {
    if (!navReady) return;
    if (app.status === "needs_profile") {
      wasOnboarding.current = true;
      if (path !== "/onboarding/profile") router.replace("/onboarding/profile");
    } else if (app.status === "needs_permissions") {
      wasOnboarding.current = true;
      if (path !== "/onboarding/source") router.replace("/onboarding/source");
    } else if (
      (app.status === "ready" || app.status === "syncing") &&
      app.source &&
      wasOnboarding.current
    ) {
      wasOnboarding.current = false;
      if (path.startsWith("/onboarding")) router.replace("/");
    }
  }, [navReady, app.status, app.source, path, router]);

  // Stable across the re-render every navigation brings (usePathname): new options would rebuild every descriptor.
  // `ios_from_right`: the new screen slides in from the right edge (accelerate-decelerate over the platform's short
  // animation time, 200 ms) while the one under it eases 30 % to the left, a view animation run by the platform on the
  // UI thread. The person asked for a clear, quick move between screens. It stays smooth because what slides in is
  // light: queries wait for the slide (useQuery, ScreenTransition), the cache hands a screen its numbers the moment it
  // has landed, and the deeper sections mount after it. System back pops with the reverse. freezeOnBlur stops covered
  // screens from re-rendering on app-state ticks while a detail screen is open.
  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: c.background },
      animation: "ios_from_right" as const,
      freezeOnBlur: true,
    }),
    [c.background],
  );

  const fatal = app.status === "error" && !app.profile;
  const covered = app.status === "booting" || fatal;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* Every screen learns when its push transition has ended (useAfterTransition): charts and queries wait for it. */}
      <CoverableContent>
        <Stack screenOptions={screenOptions} screenLayout={screenLayout}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="onboarding/profile"
            options={{ animation: "fade" }}
          />
          <Stack.Screen
            name="onboarding/source"
            options={{ animation: "fade" }}
          />
        </Stack>
      </CoverableContent>
      {covered && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              backgroundColor: c.background,
            },
          ]}
        >
          {fatal ? (
            <>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Halo could not start.
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 13,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {app.error}
              </Text>
            </>
          ) : (
            <ActivityIndicator color={c.foregroundSecondary} />
          )}
        </View>
      )}
    </View>
  );
}
