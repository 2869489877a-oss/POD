"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

// The public project URL is not a secret. Hard-code it so a mis-typed env var
// can never point the app at the wrong project.
const POD_SUPABASE_URL = "https://qqmftpunsuogmqgonpko.supabase.co";

export function createSupabaseBrowserClient() {
  // Only accept an env value that looks like a real https URL.
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

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }

  return browserClient;
}
