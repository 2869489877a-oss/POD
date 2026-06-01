"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type DashboardStats = {
  todayUploads: number;
  totalAssets: number;
  pendingJobs: number;
  totalDrafts: number;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  try {
    const supabase = createSupabaseServiceRoleClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayRes, totalRes, jobsRes, draftsRes] = await Promise.all([
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("image_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      supabase
        .from("product_drafts")
        .select("id", { count: "exact", head: true }),
    ]);

    return {
      todayUploads: todayRes.count ?? 0,
      totalAssets: totalRes.count ?? 0,
      pendingJobs: jobsRes.count ?? 0,
      totalDrafts: draftsRes.count ?? 0,
    };
  } catch {
    return { todayUploads: 0, totalAssets: 0, pendingJobs: 0, totalDrafts: 0 };
  }
}
