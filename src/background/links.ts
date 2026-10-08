// A tapped notification opens its screen. expo-notifications does not open URLs itself; this hook reads the response
// (the cold-start one too) and pushes the route once the root navigator exists. The `url` is the app's own scheme
// ("pulse://journal", app.json `scheme`), the same links Android hands expo-router from outside.
import * as React from "react";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState, type Href } from "expo-router";

/** "pulse://settings?s=source" → "/settings?s=source"; a path passes through. */
export function pathOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(.*)$/i.exec(url);
  const rest = m ? m[1] : url;
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/** Mount once, under the root layout: navigates to a tapped notification's `data.url`. */
export function useNotificationDeepLinks(): void {
  const navReady = !!useRootNavigationState()?.key;
  const response = Notifications.useLastNotificationResponse();
  const handled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!navReady || !response) return;
    const key = `${response.notification.request.identifier}@${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = response.notification.request.content.data as Record<string, unknown> | null | undefined;
    const url = data?.url;
    if (typeof url === "string") router.push(pathOf(url) as Href);
    // Consumed: a later mount (a reload) must not open it again.
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [navReady, response]);
}
