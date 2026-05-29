"use client";

import { createClient } from "@supabase/supabase-js";

function requirePublicEnv(name: string, value: string | undefined) {
  if (!value) {
    console.warn(`Missing required public environment variable: ${name}`);
    return "";
  }

  return value;
}

export function createSupabaseBrowserClient() {
  return createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requirePublicEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  );
}
