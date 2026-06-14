import { createBrowserClient } from "@supabase/auth-helpers-nextjs"
import { createClient } from "@supabase/supabase-js"

const client = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const isBrowser = typeof window !== 'undefined';
const hasBypass = isBrowser && (localStorage.getItem('dev_bypass') === 'true' || document.cookie.includes('dev_bypass=true'));

if (isBrowser && hasBypass) {
  const mockSession = {
    access_token: "dev-mock-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "mock-refresh",
    user: {
      id: "4b6cb785-52b6-4f5d-8eaf-77d5f174ef81",
      email: "test@test.com",
      user_metadata: {
        provider_id: "test-123",
        user_name: "testuser",
        name: "Test User",
        avatar_url: ""
      },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    }
  };

  client.auth.getSession = async () => {
    return { data: { session: mockSession as any }, error: null };
  };

  client.auth.onAuthStateChange = (callback) => {
    setTimeout(() => callback("SIGNED_IN", mockSession as any), 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => {}
        }
      }
    } as any;
  };

  client.auth.signOut = async () => {
    localStorage.removeItem('dev_bypass');
    document.cookie = "dev_bypass=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
    document.cookie = "sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
    window.location.href = "/";
    return { error: null };
  };
}

export const supabase = client;


export const createServerSupabaseClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
