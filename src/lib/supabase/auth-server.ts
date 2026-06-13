import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-based Supabase client for Server Components / Route Handlers.
 * Respects RLS with the signed-in user's session.
 */
// Public, non-secret fallbacks for the main project so the client always
// targets the correct project even if the env vars are unset.
const SUPABASE_URL = "https://wcwhsfvkhefrcfiigauu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjd2hzZnZraGVmcmNmaWlnYXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMzI4OTgsImV4cCI6MjA5NjgwODg5OH0.R19NqRIBCsG0xD10z2dtcLoMogsYh4InsPbEoREogQA";

export async function createSupabaseAuthServerClient() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = envUrl?.startsWith("https://") ? envUrl : SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;

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
