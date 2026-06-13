import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-based Supabase client for Server Components / Route Handlers.
 * Respects RLS with the signed-in user's session.
 */
// The public project URL is not a secret. Hard-code it so a mis-typed env var
// can never point the app at the wrong project.
const POD_SUPABASE_URL = "https://qqmftpunsuogmqgonpko.supabase.co";

export async function createSupabaseAuthServerClient() {
  const envUrl =
    process.env.NEXT_PUBLIC_POD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = envUrl?.startsWith("https://") ? envUrl : POD_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_POD_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_POD_SUPABASE_ANON_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore when proxy refreshes sessions.
        }
      },
    },
  });
}
