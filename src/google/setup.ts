// What Google Cloud needs before "Connect Google account" works: the steps the app shows when Google says sign-in isn't
// set up (ERR_NOT_CONFIGURED), the same as README.md › "Google account setup".

/** Google finds Pulse's Android OAuth client by this package name and the release signing certificate's SHA-1. */
export const ANDROID_PACKAGE = "app.halo.health";
/** SHA-1 of ~/.pulse-mobile/release.keystore, which signs every release APK (plugins/withReleaseSigning.js). */
export const RELEASE_SHA1 = "DF:68:C9:30:7F:0F:C1:77:F3:31:12:EF:F4:19:D1:87:B7:1A:55:56";

export const SETUP_STEPS: string[] = [
  "At console.cloud.google.com, create a project.",
  "APIs & Services › Library: search “Google Health API” and enable it.",
  "Google Auth Platform › Branding: app name Halo and your email. Audience: External, Testing, and add your Google account under Test users.",
  "Data access › Add or remove scopes: tick the Google Health API’s read scopes (googlehealth.….readonly) and …/auth/userinfo.email, then Save.",
  `Clients › Create client › Android: package name ${ANDROID_PACKAGE}, SHA-1 ${RELEASE_SHA1}.`,
  "Back in Halo, tap Connect and allow every box. Google can take a few minutes to recognise a new client.",
];

/** The steps as one text, for Share. */
export const setupText = () => ["Halo: set up Google sign-in (Google Health API)", ...SETUP_STEPS.map((s, i) => `${i + 1}. ${s}`)].join("\n");
