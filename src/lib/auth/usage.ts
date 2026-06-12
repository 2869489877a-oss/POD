import "server-only";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type UsageEventType = "upload" | "print_extract" | "ai_generate" | "api_call";

/**
 * Records a usage event for the signed-in user. Silently no-ops when
 * unauthenticated so legacy/worker flows keep working.
 */
export async function logUsage(
  eventType: UsageEventType,
  quantity = 1,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const service = createSupabaseServiceRoleClient();
    await service.from("usage_events").insert({
      user_id: user.id,
      event_type: eventType,
      quantity,
      metadata,
    });
  } catch (error) {
    console.error("[usage] failed to log usage event:", error);
  }
}

export type QuotaCheckResult = {
  allowed: boolean;
  used: number;
  quota: number;
  reason?: string;
};

/**
 * Checks whether the signed-in user can generate `count` more images today.
 * Admins are exempt from quota limits.
 */
export async function checkDailyImageQuota(count = 1): Promise<QuotaCheckResult> {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { allowed: false, used: 0, quota: 0, reason: "未登录" };
  }

  const service = createSupabaseServiceRoleClient();

  const { data: profile } = await service
    .from("profiles")
    .select("role, status, daily_image_quota")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { allowed: false, used: 0, quota: 0, reason: "账号不存在" };
  }
  if (profile.status === "frozen") {
    return { allowed: false, used: 0, quota: profile.daily_image_quota, reason: "账号已被冻结" };
  }
  if (profile.role === "admin") {
    return { allowed: true, used: 0, quota: -1 };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: events } = await service
    .from("usage_events")
    .select("quantity")
    .eq("user_id", user.id)
    .eq("event_type", "ai_generate")
    .gte("created_at", todayStart.toISOString());

  const used = (events ?? []).reduce(
    (sum: number, e: { quantity: number }) => sum + e.quantity,
    0,
  );
  const quota = profile.daily_image_quota;

  if (used + count > quota) {
    return {
      allowed: false,
      used,
      quota,
      reason: `今日生图配额已用 ${used}/${quota}，无法再生成 ${count} 张`,
    };
  }

  return { allowed: true, used, quota };
}
