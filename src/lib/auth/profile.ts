import "server-only";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "employee";
  status: "active" | "frozen";
  daily_image_quota: number;
  created_at: string;
};

/** Returns the signed-in user's profile, or null when not authenticated. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseAuthServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, status, daily_image_quota, created_at")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return data as Profile;
}

/** Throws unless the current user is an active admin. Returns the admin profile. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    throw new Error("Forbidden: admin access required");
  }
  return profile;
}
