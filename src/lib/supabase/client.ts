"use client";

import { createClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient() {
  // Prefer the manually-managed POD_* vars (data project) and fall back to the
  // v0-managed vars only if the POD_* ones are not set.
  const url =
    process.env.NEXT_PUBLIC_POD_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_POD_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_POD_SUPABASE_URL or NEXT_PUBLIC_POD_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, key);
}
