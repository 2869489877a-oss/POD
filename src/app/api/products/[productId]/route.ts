import { NextResponse } from "next/server";

import { parseLines } from "@/lib/products/normalize";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProductDraftUpdateRequest = {
  bullet_points?: unknown;
  description?: unknown;
  price?: unknown;
  product_type?: unknown;
  sku?: unknown;
  status?: unknown;
  tags?: unknown;
  title?: unknown;
};

const allowedStatuses = new Set(["draft", "ready", "exported", "failed"]);

function getProductId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown, field: string) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return parseLines(value);
  }

  throw new Error(`${field} 必须是字符串数组或文本`);
}

function nullablePrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const price = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("价格必须是大于等于 0 的数字");
  }

  return price;
}

export async function PATCH(request: Request) {
  const productId = getProductId(request);

  if (!productId) {
    return NextResponse.json({ error: "缺少商品草稿 ID" }, { status: 400 });
  }

  let body: ProductDraftUpdateRequest;

  try {
    body = (await request.json()) as ProductDraftUpdateRequest;
  } catch {
    return NextResponse.json({ error: "无法读取商品草稿参数" }, { status: 400 });
  }

  if (typeof body.status !== "string" || !allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: "请选择有效的商品状态" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("product_drafts")
      .update({
        bullet_points: stringList(body.bullet_points, "bullet_points"),
        description: nullableString(body.description),
        price: nullablePrice(body.price),
        product_type: nullableString(body.product_type),
        sku: nullableString(body.sku),
        status: body.status,
        tags: stringList(body.tags, "tags"),
        title: nullableString(body.title),
      })
      .eq("id", productId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品草稿保存失败" },
      { status: 500 },
    );
  }
}
