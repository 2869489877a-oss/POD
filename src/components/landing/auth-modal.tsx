"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "register";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setNotice(null);
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

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(
            signInError.message === "Invalid login credentials"
              ? "邮箱或密码错误"
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
            setError("该账号已被冻结，请联系管理员");
            return;
          }
        }

        router.push("/console");
        router.refresh();
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
          setError(signUpError.message);
          return;
        }
        setNotice("注册成功！请查收邮箱完成验证后登录。");
        setMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f0f10] shadow-2xl shadow-black/60">
        {/* Top glow accent */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

        <div className="px-8 pb-8 pt-9">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 font-mono text-sm font-bold text-white">
              P
            </div>
            <span className="text-sm font-medium text-zinc-400">POD 商品图批量处理系统</span>
          </div>

          <h2 className="mt-6 text-xl font-semibold tracking-tight text-white">
            {mode === "login" ? "欢迎回来" : "创建账号"}
          </h2>
          <p className="mt-1 text-[13px] text-zinc-500">
            {mode === "login" ? "登录后进入工作控制台" : "注册成为团队成员"}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
                  className="h-10 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
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
                className="h-10 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-[13px] font-medium text-zinc-300">
                密码
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "至少 6 位" : "输入密码"}
                className="h-10 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>

            {error ? (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-400">
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 h-10 rounded-md bg-blue-600 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
            </button>
          </form>

          {/* Bottom-right switch link */}
          <div className="mt-5 flex items-center justify-end gap-1 text-[13px]">
            <span className="text-zinc-500">
              {mode === "login" ? "没有账号?" : "已有账号?"}
            </span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
                setNotice(null);
              }}
              className="font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              {mode === "login" ? "立即注册" : "去登录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
