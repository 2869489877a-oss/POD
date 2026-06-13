import "server-only";

import { createClient } from "@supabase/supabase-js";

// The public project URL is not a secret. We hard-code it as the source of
// truth so a mis-typed env var can never point the app at the wrong project.
const SUPABASE_URL = "https://wcwhsfvkhefrcfiigauu.supabase.co";

// Only accept env values that look like a real https URL; otherwise fall back
// to the hard-coded URL (guards against a key being pasted into the URL field).
function resolveUrl(...candidates: (string | undefined)[]) {
  const valid = candidates.find((v) => v?.startsWith("https://"));
  return valid ?? SUPABASE_URL;
}

export function createSupabaseServiceRoleClient() {
  const url = resolveUrl(
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const key =
    process.env.WCWH_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.POD_SECRET_KEY ??
    process.env.POD_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.service_role;

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
