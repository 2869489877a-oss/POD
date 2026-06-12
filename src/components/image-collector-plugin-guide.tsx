"use client";

import { useMemo, useState } from "react";

import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";

type ImageCollectorPluginGuideProps = {
  extensionPath: string;
};

const supportedSites = ["Temu", "SHEIN", "Pinterest", "Generic"];

const chromeSteps = [
  {
    zh: "点击下方「打开 Chrome 扩展管理」。如果浏览器没有自动跳转，就手动复制 chrome://extensions 到 Chrome 地址栏。",
    en: "Click Open Chrome Extensions below. If the browser does not navigate automatically, copy chrome://extensions into the Chrome address bar.",
  },
  {
    zh: "打开右上角「开发者模式」。",
    en: "Turn on Developer mode in the top-right corner.",
  },
  {
    zh: "点击「加载已解压的扩展程序」，选择页面上显示的插件目录。",
    en: "Click Load unpacked and choose the extension folder shown on this page.",
  },
  {
    zh: "安装成功后，把 POD Image Collector 固定到浏览器工具栏。",
    en: "After installation, pin POD Image Collector to the browser toolbar.",
  },
];

const edgeSteps = [
  {
    zh: "点击下方「打开 Edge 扩展管理」。如果浏览器没有自动跳转，就手动复制 edge://extensions 到 Edge 地址栏。",
    en: "Click Open Edge Extensions below. If the browser does not navigate automatically, copy edge://extensions into the Edge address bar.",
  },
  {
    zh: "打开左侧或左下角「开发人员模式」。",
    en: "Turn on Developer mode on the left side or bottom-left corner.",
  },
  {
    zh: "点击「加载解压缩的扩展」，选择页面上显示的插件目录。",
    en: "Click Load unpacked and choose the extension folder shown on this page.",
  },
  {
    zh: "安装成功后，把 POD Image Collector 固定到浏览器工具栏。",
    en: "After installation, pin POD Image Collector to the browser toolbar.",
  },
];

function toFileUrl(path: string) {
  return `file:///${path.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

export function ImageCollectorPluginGuide({ extensionPath }: ImageCollectorPluginGuideProps) {
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const [copied, setCopied] = useState<string | null>(null);
  const fileUrl = useMemo(() => toFileUrl(extensionPath), [extensionPath]);

  async function copyText(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
      window.prompt(t("复制下面的内容", "Copy the value below"), value);
    }
  }

  function openExtensionPage(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <section
        className={[
          "overflow-hidden rounded-2xl border shadow-sm",
          isDark
            ? "border-white/10 bg-white/[0.04] shadow-black/20"
            : "border-slate-200 bg-white shadow-slate-200/60",
        ].join(" ")}
      >
        <div
          className={[
            "border-b px-6 py-5",
            isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/80",
          ].join(" ")}
        >
          <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600">
            {t("本地浏览器插件", "Local Browser Extension")}
          </span>
          <h2 className={["mt-3 text-2xl font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
            {t("POD Image Collector 安装说明", "POD Image Collector Setup")}
          </h2>
          <p className={["mt-2 max-w-3xl text-sm leading-6", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
            {t(
              "图片采集现在通过浏览器插件完成。网页后台不再维护旧的采集模板，只保留插件安装、加载和使用说明。",
              "Image collection now runs through the browser extension. The old web template manager is no longer shown; this page only keeps setup and usage instructions.",
            )}
          </p>
        </div>

        <div className="grid gap-4 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div
            className={[
              "rounded-2xl border p-5",
              isDark ? "border-white/10 bg-slate-950/20" : "border-slate-200 bg-slate-50",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={["text-base font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
                  {t("插件目录", "Extension Folder")}
                </h3>
                <p className={["mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
                  {t("加载扩展时选择这个文件夹，必须能直接看到 manifest.json。", "Choose this folder when loading the extension. It must contain manifest.json directly.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyText(extensionPath, "path")}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:translate-y-[-1px]"
              >
                {copied === "path" ? t("已复制", "Copied") : t("复制插件目录", "Copy Folder Path")}
              </button>
            </div>

            <code
              className={[
                "mt-4 block rounded-xl border px-4 py-3 text-sm font-bold",
                isDark ? "border-white/10 bg-black/20 text-slate-100" : "border-slate-200 bg-white text-slate-800",
              ].join(" ")}
            >
              {extensionPath}
            </code>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-bold transition",
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50",
                ].join(" ")}
              >
                {t("打开插件文件夹", "Open Folder")}
              </a>
              <button
                type="button"
                onClick={() => void copyText("chrome://extensions", "chrome-url")}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-bold transition",
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50",
                ].join(" ")}
              >
                {copied === "chrome-url" ? t("已复制", "Copied") : "chrome://extensions"}
              </button>
              <button
                type="button"
                onClick={() => void copyText("edge://extensions", "edge-url")}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-bold transition",
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50",
                ].join(" ")}
              >
                {copied === "edge-url" ? t("已复制", "Copied") : "edge://extensions"}
              </button>
            </div>
          </div>

          <div
            className={[
              "rounded-2xl border p-5",
              isDark ? "border-white/10 bg-slate-950/20" : "border-slate-200 bg-white",
            ].join(" ")}
          >
            <h3 className={["text-base font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
              {t("适用场景", "What It Does")}
            </h3>
            <p className={["mt-2 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {t(
                "插件在浏览器页面里识别商品图，支持手动扫描、自动滚动采集、下载到本地和上传到 OSS。安装后在目标网页点击插件图标即可使用。",
                "The extension detects product images in browser pages, supports manual scanning, auto-scroll collection, local download, and OSS upload. After installation, open a target page and click the extension icon.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {supportedSites.map((site) => (
                <span
                  key={site}
                  className="rounded-full px-3 py-1 text-xs font-black"
                  style={{ background: `${colors.primary}1f`, color: colors.primary }}
                >
                  {site}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BrowserGuide
          browser="Chrome"
          url="chrome://extensions"
          buttonText={t("打开 Chrome 扩展管理", "Open Chrome Extensions")}
          steps={chromeSteps.map((step) => t(step.zh, step.en))}
          onOpen={() => openExtensionPage("chrome://extensions")}
          isDark={isDark}
        />
        <BrowserGuide
          browser="Microsoft Edge"
          url="edge://extensions"
          buttonText={t("打开 Edge 扩展管理", "Open Edge Extensions")}
          steps={edgeSteps.map((step) => t(step.zh, step.en))}
          onOpen={() => openExtensionPage("edge://extensions")}
          isDark={isDark}
        />
      </section>

      <section
        className={[
          "rounded-2xl border p-6",
          isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white",
        ].join(" ")}
      >
        <h3 className={["text-lg font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
          {t("日常使用流程", "Daily Workflow")}
        </h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              zh: "打开商品或素材网站",
              en: "Open a product or asset site",
              descZh: "进入 Temu、SHEIN、Pinterest 或普通素材页面。",
              descEn: "Open Temu, SHEIN, Pinterest, or a generic asset page.",
            },
            {
              zh: "点击插件图标",
              en: "Click the extension icon",
              descZh: "也可以点击网页里的悬浮采集按钮。",
              descEn: "You can also use the floating collector button on the page.",
            },
            {
              zh: "扫描并勾选图片",
              en: "Scan and select images",
              descZh: "设置目标数量，按网站类型执行采集。",
              descEn: "Set target count and run collection by site type.",
            },
            {
              zh: "下载或上传 OSS",
              en: "Download or upload to OSS",
              descZh: "图片会按站点自动归类到下载目录或 OSS 目录。",
              descEn: "Images are grouped by site in the download folder or OSS path.",
            },
          ].map((item, index) => (
            <div
              key={item.en}
              className={[
                "rounded-2xl border p-4",
                isDark ? "border-white/10 bg-slate-950/20" : "border-slate-200 bg-slate-50",
              ].join(" ")}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-black text-emerald-600">
                {index + 1}
              </span>
              <h4 className={["mt-3 text-sm font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
                {t(item.zh, item.en)}
              </h4>
              <p className={["mt-1 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
                {t(item.descZh, item.descEn)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BrowserGuide({
  browser,
  buttonText,
  isDark,
  onOpen,
  steps,
  url,
}: {
  browser: string;
  buttonText: string;
  isDark: boolean;
  onOpen: () => void;
  steps: string[];
  url: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border p-6 shadow-sm",
        isDark
          ? "border-white/10 bg-white/[0.04] shadow-black/20"
          : "border-slate-200 bg-white shadow-slate-200/60",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={["text-lg font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
            {browser}
          </h3>
          <p className={["mt-1 text-sm font-bold", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
            {url}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:translate-y-[-1px]"
        >
          {buttonText}
        </button>
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-black text-emerald-600">
              {index + 1}
            </span>
            <span className={["text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600"].join(" ")}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
