"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { AuthModal } from "@/components/landing/auth-modal";

/* ------------------------------------------------------------------ */
/* Animated counter                                                    */
/* ------------------------------------------------------------------ */
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const duration = 1400;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(target * eased));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll-reveal wrapper                                               */
/* ------------------------------------------------------------------ */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing page                                                        */
/* ------------------------------------------------------------------ */
const capabilities = [
  {
    title: "一键智能抠图",
    desc: "AI 自动分离主体与背景，批量输出透明底素材",
    image: "/images/tool-cutout.png",
  },
  {
    title: "印花图案提取",
    desc: "从成衣照片中精准提取印花图案，直接用于二次生产",
    image: "/images/tool-print-extract.png",
  },
  {
    title: "批量套图生成",
    desc: "一张设计稿自动套用至 T 恤、卫衣、马克杯等多种商品模板",
    image: "/images/tool-mockup.png",
  },
  {
    title: "AI 图片生成",
    desc: "多模型轮换调度，文字描述直接生成可商用的设计图案",
    image: "/images/tool-ai-image.png",
  },
];

const pipeline = [
  { step: "01", title: "素材采集", desc: "上传 / 链接导入 / 插件采集" },
  { step: "02", title: "智能处理", desc: "抠图 / 印花提取 / 尺寸标准化" },
  { step: "03", title: "合规检测", desc: "侵权风险自动筛查" },
  { step: "04", title: "套图生成", desc: "多商品模板批量合成" },
  { step: "05", title: "一键导出", desc: "Excel + 图片包直达上架" },
];

export function LandingPage() {
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"login" | "register">("login");

  // Support /?auth=login redirects from the middleware
  useEffect(() => {
    const auth = searchParams.get("auth");
    if (auth === "login" || auth === "register") {
      setModalMode(auth);
      setModalOpen(true);
    }
  }, [searchParams]);

  function openAuth(mode: "login" | "register") {
    setModalMode(mode);
    setModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* ============ Nav ============ */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 font-mono text-[13px] font-bold text-white">
              P
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">
              POD 图像处理中心
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="rounded-md px-3.5 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:text-white"
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="rounded-md bg-white px-3.5 py-1.5 text-[13px] font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              注册
            </button>
          </div>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden pt-14">
        {/* Background visual */}
        <div className="absolute inset-0">
          <Image
            src="/images/hero-tech.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/80 to-[#0a0a0a]" />
        </div>

        {/* Floating glow orbs (pure CSS animation) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[12%] top-[22%] h-56 w-56 rounded-full bg-blue-600/20 blur-[90px] landing-float"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[10%] top-[40%] h-44 w-44 rounded-full bg-cyan-500/10 blur-[80px] landing-float-delay"
        />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-24 text-center sm:pt-32">
          <div className="landing-fade-up inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-medium text-zinc-300">全流程自动化 · 内部生产系统</span>
          </div>

          <h1 className="landing-fade-up-1 mt-7 max-w-3xl text-balance text-4xl font-semibold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-6xl">
            让每一张商品图
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              自动完成生产
            </span>
          </h1>

          <p className="landing-fade-up-2 mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-zinc-400">
            从素材采集、智能抠图、印花提取，到侵权检测、批量套图与一键导出——
            一个平台覆盖 POD 商品图的完整生产管线。
          </p>

          <div className="landing-fade-up-3 mt-9 flex items-center gap-4">
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="group flex h-11 items-center gap-2 rounded-md bg-blue-600 px-6 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-500/30"
            >
              开始使用
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="flex h-11 items-center rounded-md border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:border-white/[0.24] hover:bg-white/[0.08]"
            >
              已有账号登录
            </button>
          </div>

          {/* Stats strip */}
          <div className="landing-fade-up-3 mt-20 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
            {[
              { label: "处理能力 / 日", value: 10000, suffix: "+" },
              { label: "商品模板", value: 120, suffix: "+" },
              { label: "AI 模型接入", value: 5, suffix: "" },
              { label: "流程自动化率", value: 95, suffix: "%" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 bg-[#0d0d0e] px-4 py-5">
                <span className="text-xl font-semibold text-white">
                  <AnimatedNumber target={s.value} suffix={s.suffix} />
                </span>
                <span className="text-[11px] text-zinc-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Capabilities ============ */}
      <section className="relative mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">
              Capabilities
            </span>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              四大核心处理能力
            </h2>
            <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-zinc-500">
              每个环节都由 AI 驱动，批量执行，无需人工逐张操作。
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {capabilities.map((cap, i) => (
            <Reveal key={cap.title} delay={i * 100}>
              <div className="group overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0f0f10] transition-colors duration-200 hover:border-white/[0.16]">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={cap.image || "/placeholder.svg"}
                    alt={cap.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f10] via-transparent to-transparent" />
                </div>
                <div className="px-6 pb-6">
                  <h3 className="text-[15px] font-semibold text-white">{cap.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{cap.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ Pipeline ============ */}
      <section className="border-t border-white/[0.06] bg-[#0d0d0e]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <div className="flex flex-col items-center text-center">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">
                Pipeline
              </span>
              <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                五步完成整条生产线
              </h2>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {pipeline.map((p, i) => (
              <Reveal key={p.step} delay={i * 80}>
                <div className="relative flex h-full flex-col gap-3 rounded-[10px] border border-white/[0.08] bg-[#0f0f10] p-5">
                  <span className="font-mono text-xs font-medium text-blue-400">{p.step}</span>
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  <p className="text-[12px] leading-relaxed text-zinc-500">{p.desc}</p>
                  {i < pipeline.length - 1 ? (
                    <svg
                      aria-hidden="true"
                      className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-zinc-700 lg:block"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[110px]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-28 text-center">
          <Reveal>
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              准备好开始了吗？
            </h2>
            <p className="mt-3 text-sm text-zinc-500">登录工作台，让商品图生产自动运转。</p>
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="mt-8 h-11 rounded-md bg-blue-600 px-8 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-colors duration-200 hover:bg-blue-500"
            >
              开始使用
            </button>
          </Reveal>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="text-xs text-zinc-600">POD 商品图批量处理系统 · 内部使用</span>
          <span className="font-mono text-xs text-zinc-700">v2.0</span>
        </div>
      </footer>

      <AuthModal open={modalOpen} initialMode={modalMode} onClose={() => setModalOpen(false)} />
    </div>
  );
}
