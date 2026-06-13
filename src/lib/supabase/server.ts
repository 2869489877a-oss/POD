import "server-only";

import { createClient } from "@supabase/supabase-js";

// The public project URL is not a secret. We hard-code it as the source of
// truth so a mis-typed env var can never point the app at the wrong project.
const POD_SUPABASE_URL = "https://qqmftpunsuogmqgonpko.supabase.co";

// Only accept env values that look like a real https URL; otherwise fall back
// to the hard-coded URL (guards against a key being pasted into the URL field).
function resolveUrl(...candidates: (string | undefined)[]) {
  const valid = candidates.find((v) => v?.startsWith("https://"));
  return valid ?? POD_SUPABASE_URL;
}

export function createSupabaseServiceRoleClient() {
  const url = resolveUrl(
    process.env.POD_SUPABASE_URL,
    process.env.NEXT_PUBLIC_POD_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const key =
    process.env.POD_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.service_role ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Missing POD_SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
