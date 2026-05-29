import "server-only";

import { createClient } from "@supabase/supabase-js";

function requireServerEnv(name: string, value: string | undefined) {
  if (!value) {
    console.warn(`Missing required server environment variable: ${name}`);
    return "";
  }

  return value;
}

export function createSupabaseServiceRoleClient() {
  return createClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
