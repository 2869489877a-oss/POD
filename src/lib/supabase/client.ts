"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

// Public, non-secret fallbacks for the main project so the browser client always
// targets the correct project even if the env vars are unset.
const SUPABASE_URL = "https://wcwhsfvkhefrcfiigauu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjd2hzZnZraGVmcmNmaWlnYXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMzI4OTgsImV4cCI6MjA5NjgwODg5OH0.R19NqRIBCsG0xD10z2dtcLoMogsYh4InsPbEoREogQA";

export function createSupabaseBrowserClient() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = envUrl?.startsWith("https://") ? envUrl : SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }

  return browserClient;
}
