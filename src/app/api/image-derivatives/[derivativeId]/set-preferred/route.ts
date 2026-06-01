import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ImageDerivativeForPreferred = {
  asset_id: string;
  output_url: string | null;
};

function getDerivativeId(request: Request): string {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-2) ?? "");
}

export async function POST(request: Request) {
  const derivativeId = getDerivativeId(request);

  if (!derivativeId) {
    return NextResponse.json({ error: "Missing derivative id" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("image_derivatives")
      .select("asset_id,output_url")
      .eq("id", derivativeId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ error: "Derivative not found" }, { status: 404 });
    }

    const derivative = data as unknown as ImageDerivativeForPreferred;

    if (!derivative.output_url) {
      return NextResponse.json({ error: "Derivative has no output_url" }, { status: 400 });
    }

    const { data: asset, error: updateError } = await supabase
      .from("assets")
      .update({ preferred_design_url: derivative.output_url })
      .eq("id", derivative.asset_id)
      .select("id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set preferred design image" },
      { status: 500 },
    );
  }
}
