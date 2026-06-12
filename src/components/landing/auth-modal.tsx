"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type AuthStatus =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success"; title: string; message: string }
  | { state: "error"; title: string; message: string };

type AuthModalProps = {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
};

export function AuthModal({ open, initialMode = "login", onClose }: AuthModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>({ state: "idle" });
  const [shakeKey, setShakeKey] = useState(0);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setNotice(null);
      setStatus({ state: "idle" });
    }
  }, [open, initialMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  if (!open) return null;

  const isBusy = status.state === "submitting" || status.state === "success";

  function showError(title: string, message: string) {
    setStatus({ state: "error", title, message });
    setShakeKey((k) => k + 1);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => {
      setStatus((current) => (current.state === "error" ? { state: "idle" } : current));
    }, 2200);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    setNotice(null);
    setStatus({ state: "submitting" });

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          showError(
            "登录失败",
            signInError.message === "Invalid login credentials"
              ? "请检查账号或者密码是否正确"
              : signInError.message,
          );
          return;
        }

        // Frozen-account check
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("status")
            .eq("id", user.id)
            .single();
          if (profile?.status === "frozen") {
            await supabase.auth.signOut();
            showError("登录失败", "该账号已被冻结，请联系管理员");
            return;
          }
        }

        setStatus({ state: "success", title: "登录成功", message: "正在进入工作控制台…" });
        redirectTimer.current = setTimeout(() => {
          window.location.assign("/console");
        }, 1100);
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
              `${window.location.origin}/auth/callback`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (signUpError) {
          showError("注册失败", signUpError.message);
          return;
        }
        setStatus({ state: "success", title: "注册成功", message: "请查收邮箱完成验证后登录" });
        redirectTimer.current = setTimeout(() => {
          setStatus({ state: "idle" });
          setNotice("注册成功！请查收邮箱完成验证后登录。");
          setMode("login");
        }, 1400);
      }
    } catch (err) {
      showError("操作失败", err instanceof Error ? err.message : "请稍后重试");
    }
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-zinc-600 transition-all duration-200 focus:border-blue-500/70 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "登录" : "注册"}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="auth-backdrop-in absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      {/* Panel */}
      <div
        key={shakeKey}
        className={`auth-modal-in relative w-full max-w-[410px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0c0c0d] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] ${
          status.state === "error" ? "auth-shake" : ""
        }`}
      >
        {/* Decorative top area */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
          <div className="absolute -top-24 left-1/2 h-48 w-[480px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/70 to-transparent" />
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ===== Status overlay: success / error ===== */}
        {(status.state === "success" || status.state === "error") && (
          <div className="auth-fade-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#0c0c0d]/95 backdrop-blur-sm">
            {status.state === "success" ? (
              <div className="auth-status-pop auth-ring-success flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500">
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path className="auth-stroke" strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="auth-status-pop auth-ring-error flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500">
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path className="auth-stroke" strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
            )}
            <div className="text-center">
              <p className="text-base font-semibold text-white">{status.title}</p>
              <p className="mt-1.5 text-[13px] text-zinc-400">{status.message}</p>
            </div>
          </div>
        )}

        <div className="relative px-9 pb-9 pt-10">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 shadow-lg shadow-blue-900/50">
              <span className="font-mono text-lg font-bold text-white">P</span>
            </div>
            <div className="text-center">
              <h2 className="text-[19px] font-semibold tracking-tight text-white">
                {mode === "login" ? "欢迎回来" : "创建账号"}
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500">
                {mode === "login" ? "登录 POD 商品图批量处理系统" : "注册成为团队成员"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {mode === "register" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-name" className="text-[13px] font-medium text-zinc-300">
                  姓名
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="你的名字"
                  disabled={isBusy}
                  className={inputClass}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-[13px] font-medium text-zinc-300">
                邮箱
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={isBusy}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-[13px] font-medium text-zinc-300">
                密码
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "至少 6 位" : "输入密码"}
                  disabled={isBusy}
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {notice ? (
              <p className="auth-fade-in flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-400">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isBusy}
              className="mt-1.5 flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-medium text-white shadow-lg shadow-blue-900/40 transition-all duration-200 hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status.state === "submitting" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
                  </svg>
                  {mode === "login" ? "正在验证…" : "正在注册…"}
                </>
              ) : mode === "login" ? (
                "登录"
              ) : (
                "注册"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500/80">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              内部使用 · 杜绝外传
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* Bottom-right switch link */}
          <div className="mt-4 flex items-center justify-end gap-1 text-[13px]">
            <span className="text-zinc-500">
              {mode === "login" ? "没有账号?" : "已有账号?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setNotice(null);
                setStatus({ state: "idle" });
              }}
              className="font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              {mode === "login" ? "立即注册" : "去登录"}
            </button>
          </div>

          {/* Copyright attribution */}
          <p className="mt-5 text-center font-mono text-[10px] text-zinc-700">
            {"© 2026 POD Internal Systems. All Rights Reserved."}
          </p>
        </div>
      </div>
    </div>
  );
}
