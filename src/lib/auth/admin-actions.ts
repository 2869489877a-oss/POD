"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, type Profile } from "@/lib/auth/profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ActionResult = { success: boolean; error?: string };

export type MemberRow = Profile & {
  today_uploads: number;
  today_prints: number;
  today_ai_generates: number;
  today_api_calls: number;
};

/** List all members with today's usage stats (admin only). */
export async function listMembers(): Promise<MemberRow[]> {
  await requireAdmin();
  const service = createSupabaseServiceRoleClient();

  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, email, display_name, role, status, daily_image_quota, created_at")
    .order("created_at", { ascending: true });

  if (error || !profiles) return [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: events } = await service
    .from("usage_events")
    .select("user_id, event_type, quantity")
    .gte("created_at", todayStart.toISOString());

  const usageMap = new Map<
    string,
    { upload: number; print_extract: number; ai_generate: number; api_call: number }
  >();

  for (const e of events ?? []) {
    const entry = usageMap.get(e.user_id) ?? {
      upload: 0,
      print_extract: 0,
      ai_generate: 0,
      api_call: 0,
    };
    entry[e.event_type as keyof typeof entry] += e.quantity;
    usageMap.set(e.user_id, entry);
  }

  return (profiles as Profile[]).map((p) => {
    const u = usageMap.get(p.id) ?? { upload: 0, print_extract: 0, ai_generate: 0, api_call: 0 };
    return {
      ...p,
      today_uploads: u.upload,
      today_prints: u.print_extract,
      today_ai_generates: u.ai_generate,
      today_api_calls: u.api_call,
    };
  });
}

/** Create a new employee account (admin only). Email auto-confirmed. */
export async function createMember(input: {
  email: string;
  password: string;
  displayName: string;
  role: "admin" | "employee";
  dailyImageQuota: number;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const service = createSupabaseServiceRoleClient();

    const { data, error } = await service.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName },
    });

    if (error) return { success: false, error: error.message };

    if (data.user) {
      await service
        .from("profiles")
        .update({
          role: input.role,
          daily_image_quota: input.dailyImageQuota,
          display_name: input.displayName,
        })
        .eq("id", data.user.id);
    }

    revalidatePath("/account-management");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

/** Delete a member account entirely (admin only). */
export async function deleteMember(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { success: false, error: "不能删除自己的账号" };
    }
    const service = createSupabaseServiceRoleClient();
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) return { success: false, error: error.message };

    revalidatePath("/account-management");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

/** Freeze or unfreeze a member (admin only). */
export async function setMemberStatus(
  userId: string,
  status: "active" | "frozen",
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { success: false, error: "不能冻结自己的账号" };
    }
    const service = createSupabaseServiceRoleClient();
    const { error } = await service.from("profiles").update({ status }).eq("id", userId);
    if (error) return { success: false, error: error.message };

    revalidatePath("/account-management");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

/** Update a member's daily AI image quota (admin only). */
export async function setMemberQuota(userId: string, quota: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (quota < 0 || !Number.isFinite(quota)) {
      return { success: false, error: "配额必须是非负整数" };
    }
    const service = createSupabaseServiceRoleClient();
    const { error } = await service
      .from("profiles")
      .update({ daily_image_quota: Math.floor(quota) })
      .eq("id", userId);
    if (error) return { success: false, error: error.message };

    revalidatePath("/account-management");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

/** Reset a member's password (admin only). */
export async function resetMemberPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (newPassword.length < 6) {
      return { success: false, error: "密码至少 6 位" };
    }
    const service = createSupabaseServiceRoleClient();
    const { error } = await service.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return { success: false, error: error.message };

    revalidatePath("/account-management");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "操作失败" };
  }
}

export type UsageDay = {
  date: string;
  upload: number;
  print_extract: number;
  ai_generate: number;
  api_call: number;
};

/** Per-user usage for the last `days` days (admin only). */
export async function getMemberUsageHistory(userId: string, days = 7): Promise<UsageDay[]> {
  await requireAdmin();
  const service = createSupabaseServiceRoleClient();

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const { data: events } = await service
    .from("usage_events")
    .select("event_type, quantity, created_at")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  const dayMap = new Map<string, UsageDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, upload: 0, print_extract: 0, ai_generate: 0, api_call: 0 });
  }

  for (const e of events ?? []) {
    const key = new Date(e.created_at).toISOString().slice(0, 10);
    const day = dayMap.get(key);
    if (day) {
      day[e.event_type as "upload" | "print_extract" | "ai_generate" | "api_call"] += e.quantity;
    }
  }

  return Array.from(dayMap.values());
}
