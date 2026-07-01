"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type DashboardStats = {
  activeAiJobs: number;
  blockedChecks: number;
  clearChecks: number;
  completedAiJobs: number;
  completedJobs: number;
  exportedDrafts: number;
  failedAiJobs: number;
  failedAssets: number;
  failedJobs: number;
  mockupOutputs: number;
  pendingChecks: number;
  processedAssets: number;
  readyDrafts: number;
  reviewChecks: number;
  riskyChecks: number;
  todayUploads: number;
  totalAssets: number;
  pendingJobs: number;
  totalDrafts: number;
};

const emptyDashboardStats: DashboardStats = {
  activeAiJobs: 0,
  blockedChecks: 0,
  clearChecks: 0,
  completedAiJobs: 0,
  completedJobs: 0,
  exportedDrafts: 0,
  failedAiJobs: 0,
  failedAssets: 0,
  failedJobs: 0,
  mockupOutputs: 0,
  pendingChecks: 0,
  processedAssets: 0,
  readyDrafts: 0,
  reviewChecks: 0,
  riskyChecks: 0,
  todayUploads: 0,
  totalAssets: 0,
  pendingJobs: 0,
  totalDrafts: 0,
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  try {
    const supabase = createSupabaseServiceRoleClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayRes,
      totalRes,
      processedAssetsRes,
      failedAssetsRes,
      jobsRes,
      completedJobsRes,
      failedJobsRes,
      draftsRes,
      readyDraftsRes,
      exportedDraftsRes,
      clearChecksRes,
      pendingChecksRes,
      reviewChecksRes,
      riskyChecksRes,
      blockedChecksRes,
      aiActiveRes,
      aiCompletedRes,
      aiFailedRes,
      mockupOutputsRes,
    ] = await Promise.all([
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("status", "processed"),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("image_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      supabase
        .from("image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("image_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["failed", "partial_failed"]),
      supabase
        .from("product_drafts")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("product_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "ready"),
      supabase
        .from("product_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "exported"),
      supabase
        .from("infringement_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "clear"),
      supabase
        .from("infringement_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("infringement_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "review"),
      supabase
        .from("infringement_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "risky"),
      supabase
        .from("infringement_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "blocked"),
      supabase
        .from("ai_image_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      supabase
        .from("ai_image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("ai_image_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("mockup_outputs")
        .select("id", { count: "exact", head: true }),
    ]);

    return {
      activeAiJobs: aiActiveRes.count ?? 0,
      blockedChecks: blockedChecksRes.count ?? 0,
      clearChecks: clearChecksRes.count ?? 0,
      completedAiJobs: aiCompletedRes.count ?? 0,
      completedJobs: completedJobsRes.count ?? 0,
      exportedDrafts: exportedDraftsRes.count ?? 0,
      failedAiJobs: aiFailedRes.count ?? 0,
      failedAssets: failedAssetsRes.count ?? 0,
      failedJobs: failedJobsRes.count ?? 0,
      mockupOutputs: mockupOutputsRes.count ?? 0,
      pendingChecks: pendingChecksRes.count ?? 0,
      processedAssets: processedAssetsRes.count ?? 0,
      readyDrafts: readyDraftsRes.count ?? 0,
      reviewChecks: reviewChecksRes.count ?? 0,
      riskyChecks: riskyChecksRes.count ?? 0,
      todayUploads: todayRes.count ?? 0,
      totalAssets: totalRes.count ?? 0,
      pendingJobs: jobsRes.count ?? 0,
      totalDrafts: draftsRes.count ?? 0,
    };
  } catch {
    return emptyDashboardStats;
  }
}
