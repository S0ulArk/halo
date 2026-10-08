/**
 * Whether Settings and onboarding offer the Google account (Google Health API) as a data source. It was kept off while
 * the source was being built (a build could ship from a half-done tree); switching it off again hides the choice, and
 * the sync, background task and live pull keep working for anyone whose saved source is already "google".
 */
// Off (2026-10-08): the person chose Google Health (via Health Connect) for now and doesn't want the Google Cloud setup.
// The native sign-in module is also left out of the build (modules/pulse-google/expo-module.config.json.disabled);
// turning this back on means renaming that file back to expo-module.config.json and rebuilding.
export const GOOGLE_SOURCE_ENABLED = false;
