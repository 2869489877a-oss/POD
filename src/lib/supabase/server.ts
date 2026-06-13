import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceRoleClient() {
  // Prefer POD_* vars (managed manually, pointing at the data project) and fall
  // back to the v0-managed vars only if the POD_* ones are not set.
  const url =
    process.env.POD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_POD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.POD_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing POD_SUPABASE_URL or POD_SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
