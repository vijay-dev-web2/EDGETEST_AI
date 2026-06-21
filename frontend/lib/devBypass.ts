// Dev auth bypass — local development / demo convenience ONLY.
//
// When enabled, the app uses a mock Supabase session backed by the backend's
// "dev-mock-token". This must mirror the backend gate (auth.py): the backend
// rejects the token when APP_ENV=production, so the demo button is hidden here
// in production to keep both ends consistent.
//
// Set NEXT_PUBLIC_APP_ENV=production in production deployments to disable it.
// Defaults to enabled when unset (local development).
export const DEV_BYPASS_TOKEN = "dev-mock-token";

export const DEV_BYPASS_ENABLED =
  process.env.NEXT_PUBLIC_APP_ENV !== "production";
