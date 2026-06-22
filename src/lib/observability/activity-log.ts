import "server-only";

import { appendLocalJsonl, localDatePath } from "@/lib/storage/local-data";

type ActivityStatus = "failure" | "info" | "success";

type ActivityLogInput = {
  action: string;
  durationMs?: number;
  entityId?: string | null;
  entityType?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
  status?: ActivityStatus;
};

function requestContext(request?: Request) {
  if (!request) return {};

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return {
    ip: forwardedFor || request.headers.get("x-real-ip") || null,
    user_agent: request.headers.get("user-agent"),
  };
}

export async function logActivity(input: ActivityLogInput) {
  if (process.env.ACTIVITY_LOG_ENABLED === "false") return;

  const createdAt = new Date();

  try {
    await appendLocalJsonl(`logs/activity/${localDatePath(createdAt)}.jsonl`, {
      action: input.action,
      created_at: createdAt.toISOString(),
      duration_ms: input.durationMs,
      entity_id: input.entityId ?? null,
      entity_type: input.entityType ?? null,
      message: input.message,
      metadata: input.metadata ?? {},
      status: input.status ?? "info",
      ...requestContext(input.request),
    });
  } catch {
    // Activity logs must never break the user-facing workflow.
  }
}

export function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
