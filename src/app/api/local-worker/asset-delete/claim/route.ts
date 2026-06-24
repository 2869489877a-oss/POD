import { NextResponse } from "next/server";

import { claimAssetDeleteJob } from "@/lib/assets/delete-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isMissingRelationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|schema cache|asset_delete_jobs/i.test(message);
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const job = await claimAssetDeleteJob(createSupabaseServiceRoleClient());

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({
        job: null,
        ok: true,
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to claim asset delete job", ok: false },
      { status: 500 },
    );
  }
}
