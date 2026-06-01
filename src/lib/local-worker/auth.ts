import { NextResponse } from "next/server";

export function getLocalWorkerSecret() {
  return process.env.LOCAL_WORKER_SECRET?.trim() || process.env.WORKER_SECRET?.trim() || "";
}

export function requireLocalWorkerAuth(request: Request): NextResponse | null {
  const secret = getLocalWorkerSecret();

  if (!secret) {
    return NextResponse.json(
      { error: "服务器未配置 LOCAL_WORKER_SECRET，不能启用本地 worker 接口" },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "本地 worker 认证失败" }, { status: 401 });
  }

  return null;
}
