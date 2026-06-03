"use client";

import { useMemo, useState } from "react";

import {
  fetchInfringementDashboard,
  type InfringementCheckRow,
  type InfringementListItem,
} from "@/lib/actions/infringement-checks";
import { useSettings } from "@/lib/settings/context";

type CheckStatus = "pending" | "clear" | "review" | "risky" | "blocked";
type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
type CopyrightStatus = "unknown" | "owned" | "commercial_ok" | "risky" | "forbidden";

type RuleMatch = {
  category?: string;
  description?: string;
  field?: string;
  label?: string;
  matched?: string;
  rule_id?: string;
  severity?: string;
};

type RunChecksResponse = {
  checks?: InfringementCheckRow[];
  error?: string;
  message?: string;
};

type ReviewResponse = {
  check?: InfringementCheckRow;
  error?: string;
  ok?: boolean;
};

type InfringementChecksManagerProps = {
  initialError?: string | null;
  initialItems: InfringementListItem[];
};

const checkStatusLabels: Record<CheckStatus, { en: string; zh: string }> = {
  blocked: { en: "Blocked", zh: "禁用" },
  clear: { en: "Clear", zh: "未命中" },
  pending: { en: "Pending", zh: "待检测" },
  review: { en: "Review", zh: "待复核" },
  risky: { en: "Risky", zh: "高风险" },
};

const riskLevelLabels: Record<RiskLevel, { en: string; zh: string }> = {
  critical: { en: "Critical", zh: "极高" },
  high: { en: "High", zh: "高" },
  low: { en: "Low", zh: "低" },
  medium: { en: "Medium", zh: "中" },
  unknown: { en: "Unknown", zh: "未知" },
};

const copyrightLabels: Record<CopyrightStatus, { en: string; zh: string }> = {
  commercial_ok: { en: "Commercial OK", zh: "可商用" },
  forbidden: { en: "Forbidden", zh: "禁用" },
  owned: { en: "Owned", zh: "自有" },
  risky: { en: "Risky", zh: "有风险" },
  unknown: { en: "Unknown", zh: "未知" },
};

const checkStatusStyles: Record<CheckStatus, string> = {
  blocked: "bg-red-100 text-red-800",
  clear: "bg-emerald-50 text-emerald-700",
  pending: "bg-zinc-100 text-zinc-700",
  review: "bg-amber-50 text-amber-700",
  risky: "bg-orange-100 text-orange-800",
};

const copyrightStyles: Record<CopyrightStatus, string> = {
  commercial_ok: "bg-emerald-50 text-emerald-700",
  forbidden: "bg-red-100 text-red-800",
  owned: "bg-sky-50 text-sky-700",
  risky: "bg-amber-50 text-amber-700",
  unknown: "bg-zinc-100 text-zinc-700",
};

const filterOptions: Array<{ en: string; value: "all" | CheckStatus | "unchecked"; zh: string }> = [
  { en: "All", value: "all", zh: "全部" },
  { en: "Unchecked", value: "unchecked", zh: "未检测" },
  { en: "Clear", value: "clear", zh: "未命中" },
  { en: "Need Review", value: "review", zh: "待复核" },
  { en: "Risky", value: "risky", zh: "高风险" },
  { en: "Blocked", value: "blocked", zh: "禁用" },
];

const reviewOptions: Array<{ en: string; helperEn: string; helperZh: string; value: Exclude<CheckStatus, "pending">; zh: string }> = [
  {
    en: "Approve / Commercial OK",
    helperEn: "Mark asset as commercially usable after human review.",
    helperZh: "人工确认授权或自有后，标记素材可商用。",
    value: "clear",
    zh: "通过 / 可商用",
  },
  {
    en: "Needs Review",
    helperEn: "Keep the asset in manual review queue.",
    helperZh: "保留在人工复核队列，暂不导出。",
    value: "review",
    zh: "继续复核",
  },
  {
    en: "Risky",
    helperEn: "Mark as risky and avoid export until evidence is ready.",
    helperZh: "标记有风险，未补充授权前不要导出。",
    value: "risky",
    zh: "有风险",
  },
  {
    en: "Block",
    helperEn: "Mark as forbidden for product creation and export.",
    helperZh: "标记禁用，不能用于商品创建和导出。",
    value: "blocked",
    zh: "禁用",
  },
];

function isCheckStatus(value: string): value is CheckStatus {
  return ["pending", "clear", "review", "risky", "blocked"].includes(value);
}

function isRiskLevel(value: string): value is RiskLevel {
  return ["unknown", "low", "medium", "high", "critical"].includes(value);
}

function isCopyrightStatus(value: string): value is CopyrightStatus {
  return ["unknown", "owned", "commercial_ok", "risky", "forbidden"].includes(value);
}

function parseRuleMatches(value: unknown): RuleMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is RuleMatch => typeof item === "object" && item !== null);
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(id: string) {
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function getLatestStatus(item: InfringementListItem): CheckStatus | "unchecked" {
  const status = item.latest_check?.status;
  return status && isCheckStatus(status) ? status : "unchecked";
}

function getRiskLevel(check: InfringementCheckRow | null): RiskLevel {
  return check?.risk_level && isRiskLevel(check.risk_level) ? check.risk_level : "unknown";
}

function getCopyrightStatus(value: string): CopyrightStatus {
  return isCopyrightStatus(value) ? value : "unknown";
}

export function InfringementChecksManager({
  initialError = null,
  initialItems,
}: InfringementChecksManagerProps) {
  const { language, t } = useSettings();
  const [items, setItems] = useState<InfringementListItem[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | CheckStatus | "unchecked">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InfringementListItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<Exclude<CheckStatus, "pending">>("review");
  const [reviewNote, setReviewNote] = useState("");
  const [isReviewSaving, setIsReviewSaving] = useState(false);

  const visibleItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const status = getLatestStatus(item);
      if (filter !== "all" && status !== filter) return false;

      if (!keyword) return true;

      const matches = parseRuleMatches(item.latest_check?.matched_rules);
      const searchable = [
        item.asset.filename,
        item.asset.original_url,
        item.asset.source,
        item.asset.copyright_status,
        item.latest_check?.recommendation ?? "",
        ...matches.map((match) => `${match.label ?? ""} ${match.matched ?? ""} ${match.field ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [filter, items, searchQuery]);

  const selectedCount = selectedIds.size;
  const stats = useMemo(() => {
    return items.reduce(
      (current, item) => {
        const status = getLatestStatus(item);
        current.total += 1;
        if (status === "unchecked") current.unchecked += 1;
        if (status === "review") current.review += 1;
        if (status === "risky") current.risky += 1;
        if (status === "blocked") current.blocked += 1;
        if (status === "clear") current.clear += 1;
        return current;
      },
      { blocked: 0, clear: 0, review: 0, risky: 0, total: 0, unchecked: 0 },
    );
  }, [items]);

  async function refreshDashboard() {
    setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchInfringementDashboard();
      if (data.error) throw new Error(data.error);
      setItems(data.items);
      setSelectedIds((current) => {
        const nextIds = new Set(data.items.map((item) => item.asset.id));
        return new Set(Array.from(current).filter((id) => nextIds.has(id)));
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取侵权检测数据失败", "Failed to load infringement checks"));
    } finally {
      setIsRefreshing(false);
    }
  }

  function toggleAsset(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      if (visibleItems.length > 0 && visibleItems.every((item) => current.has(item.asset.id))) {
        return new Set();
      }

      return new Set(visibleItems.map((item) => item.asset.id));
    });
  }

  async function runChecks(assetIds: string[]) {
    if (assetIds.length === 0) {
      setError(t("请选择要检测的素材", "Please select assets to check"));
      return;
    }

    setIsRunning(true);
    setError(null);
    setMessage(t(`正在检测 ${assetIds.length} 张素材...`, `Checking ${assetIds.length} asset(s)...`));

    try {
      const response = await fetch("/api/infringement-checks", {
        body: JSON.stringify({ asset_ids: assetIds }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as RunChecksResponse;

      if (!response.ok) {
        throw new Error(data.error ?? t("侵权检测失败", "Infringement check failed"));
      }

      setMessage(data.message ?? t("侵权检测已完成", "Infringement check complete"));
      await refreshDashboard();
    } catch (requestError) {
      setMessage(null);
      setError(requestError instanceof Error ? requestError.message : t("侵权检测失败", "Infringement check failed"));
    } finally {
      setIsRunning(false);
    }
  }

  function openReview(item: InfringementListItem) {
    const currentStatus = getLatestStatus(item);
    setSelectedItem(item);
    setReviewStatus(currentStatus === "unchecked" || currentStatus === "pending" ? "review" : currentStatus);
    setReviewNote(item.latest_check?.reviewer_note ?? "");
    setError(null);
    setMessage(null);
  }

  async function saveReview() {
    if (!selectedItem?.latest_check) {
      setError(t("请先运行一次检测，再保存复核结果", "Run a check before saving review result"));
      return;
    }

    setIsReviewSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/infringement-checks/${selectedItem.latest_check.id}`, {
        body: JSON.stringify({ reviewer_note: reviewNote, status: reviewStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await response.json()) as ReviewResponse;

      if (!response.ok) {
        throw new Error(data.error ?? t("保存复核结果失败", "Failed to save review result"));
      }

      setSelectedItem(null);
      setMessage(t("复核结果已保存", "Review result saved"));
      await refreshDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("保存复核结果失败", "Failed to save review result"));
    } finally {
      setIsReviewSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">{t("素材总数", "Total Assets")}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">{stats.total}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">{t("未检测", "Unchecked")}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">{stats.unchecked}</p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700">{t("待复核", "Need Review")}</p>
          <p className="mt-2 text-2xl font-semibold text-amber-800">{stats.review}</p>
        </div>
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-medium text-orange-700">{t("高风险", "Risky")}</p>
          <p className="mt-2 text-2xl font-semibold text-orange-800">{stats.risky}</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-700">{t("禁用", "Blocked")}</p>
          <p className="mt-2 text-2xl font-semibold text-red-800">{stats.blocked}</p>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label htmlFor="infringement-search" className="block text-sm font-medium text-zinc-950">
              {t("搜索", "Search")}
            </label>
            <input
              id="infringement-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("文件名、URL、命中词、规则", "Filename, URL, match, rule")}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="infringement-filter" className="block text-sm font-medium text-zinc-950">
              {t("检测状态", "Check Status")}
            </label>
            <select
              id="infringement-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.zh, option.en)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={toggleVisible}
            disabled={visibleItems.length === 0}
            className="self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.asset.id))
              ? t("取消全选", "Deselect All")
              : t("全选当前", "Select Current")}
          </button>

          <button
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={isRefreshing || isRunning}
            className="self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isRefreshing ? t("刷新中...", "Refreshing...") : t("刷新", "Refresh")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>{t(`当前显示 ${visibleItems.length} 张`, `${visibleItems.length} visible`)}</span>
          <span>{t(`已选择 ${selectedCount} 张`, `${selectedCount} selected`)}</span>
          <span>{t("自动检测会读取文件名、URL 和商品草稿文案；图片视觉识别可后续接入豆包/即梦/千问视觉模型。", "Auto checks scan filenames, URLs and product draft text. Visual AI can be added later.")}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runChecks(Array.from(selectedIds))}
            disabled={selectedCount === 0 || isRunning}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isRunning ? t("检测中...", "Checking...") : t("检测所选素材", "Check Selected")}
          </button>
          <button
            type="button"
            onClick={() => void runChecks(visibleItems.filter((item) => getLatestStatus(item) === "unchecked").map((item) => item.asset.id))}
            disabled={isRunning || visibleItems.every((item) => getLatestStatus(item) !== "unchecked")}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {t("检测当前未检测", "Check Visible Unchecked")}
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8">
          <p className="text-sm font-medium text-zinc-950">{t("没有匹配的素材", "No matching assets")}</p>
          <p className="mt-2 text-sm text-zinc-600">{t("请调整筛选条件或先上传素材。", "Adjust filters or upload assets first.")}</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleItems.map((item) => {
          const status = getLatestStatus(item);
          const checkStatus = status === "unchecked" ? "pending" : status;
          const riskLevel = getRiskLevel(item.latest_check);
          const copyrightStatus = getCopyrightStatus(item.asset.copyright_status);
          const matches = parseRuleMatches(item.latest_check?.matched_rules);
          const previewUrl = item.asset.processed_url ?? item.asset.original_url;
          const isSelected = selectedIds.has(item.asset.id);

          return (
            <article
              key={item.asset.id}
              className={[
                "overflow-hidden rounded-md border bg-white transition",
                isSelected ? "border-zinc-950 ring-2 ring-zinc-950/10" : "border-zinc-200",
              ].join(" ")}
            >
              <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                <div className="relative min-h-[210px] bg-zinc-100">
                  <div
                    className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url("${previewUrl}")` }}
                    role="img"
                    aria-label={item.asset.filename}
                  />
                  <label className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAsset(item.asset.id)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("选择", "Select")}
                  </label>
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-950">{item.asset.filename}</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.asset.width} x {item.asset.height} · {item.asset.format.toUpperCase()} · {shortId(item.asset.id)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={["rounded-md px-2.5 py-1 text-xs font-medium", checkStatusStyles[checkStatus]].join(" ")}>
                        {status === "unchecked" ? t("未检测", "Unchecked") : t(checkStatusLabels[checkStatus].zh, checkStatusLabels[checkStatus].en)}
                      </span>
                      <span className={["rounded-md px-2.5 py-1 text-xs font-medium", copyrightStyles[copyrightStatus]].join(" ")}>
                        {t(copyrightLabels[copyrightStatus].zh, copyrightLabels[copyrightStatus].en)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 text-xs text-zinc-600 sm:grid-cols-3">
                    <div>
                      <p className="text-zinc-500">{t("风险等级", "Risk")}</p>
                      <p className="mt-1 font-medium text-zinc-950">{t(riskLevelLabels[riskLevel].zh, riskLevelLabels[riskLevel].en)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">{t("置信分", "Score")}</p>
                      <p className="mt-1 font-medium text-zinc-950">{item.latest_check?.confidence ?? 0}/100</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">{t("检测时间", "Checked At")}</p>
                      <p className="mt-1 font-medium text-zinc-950">
                        {formatDate(item.latest_check?.created_at ?? null, language === "zh" ? "zh-CN" : "en-US")}
                      </p>
                    </div>
                  </div>

                  {matches.length > 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-800">{t("命中规则", "Matched Rules")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {matches.slice(0, 5).map((match, index) => (
                          <span key={`${match.rule_id ?? "rule"}-${index}`} className="rounded bg-white px-2 py-1 text-xs text-amber-800">
                            {match.label ?? t("规则", "Rule")}：{match.matched ?? "-"}
                          </span>
                        ))}
                        {matches.length > 5 ? <span className="text-xs text-amber-700">+{matches.length - 5}</span> : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                      {t("规则库未命中明显风险词。注意：这不是法律意见，也不能替代视觉 Logo/OCR 检测。", "No obvious rule match. This is not legal advice and does not replace visual logo/OCR checks.")}
                    </div>
                  )}

                  <p className="line-clamp-2 text-sm leading-6 text-zinc-600">
                    {item.latest_check?.recommendation ?? t("尚未检测。建议上传后先跑规则检测，再进入套图和商品导出。", "Not checked yet. Run checks before mockups and exports.")}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void runChecks([item.asset.id])}
                      disabled={isRunning}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      {t("重新检测", "Re-check")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReview(item)}
                      disabled={!item.latest_check}
                      className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {t("人工复核", "Review")}
                    </button>
                    <a
                      href={item.asset.original_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                    >
                      {t("打开原图", "Open Image")}
                    </a>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6" role="dialog" aria-modal="true">
          <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-950">{t("人工复核", "Manual Review")}</h3>
                <p className="mt-1 text-sm text-zinc-500">{selectedItem.asset.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              >
                {t("关闭", "Close")}
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr]">
              <div>
                <div
                  className="min-h-[360px] rounded-md bg-zinc-100 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${selectedItem.asset.original_url}")` }}
                  role="img"
                  aria-label={selectedItem.asset.filename}
                />
                <a
                  href={selectedItem.asset.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  {t("新窗口打开原图", "Open original in new window")}
                </a>
              </div>

              <div className="space-y-5">
                <div className="rounded-md border border-zinc-200 p-4">
                  <h4 className="text-sm font-semibold text-zinc-950">{t("检测结论", "Detection Result")}</h4>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-zinc-500">{t("状态", "Status")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">
                        {(() => {
                          const status = getLatestStatus(selectedItem);
                          if (status === "unchecked") return t("未检测", "Unchecked");
                          return t(checkStatusLabels[status].zh, checkStatusLabels[status].en);
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("风险等级", "Risk")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">
                        {t(riskLevelLabels[getRiskLevel(selectedItem.latest_check)].zh, riskLevelLabels[getRiskLevel(selectedItem.latest_check)].en)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("置信分", "Score")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">{selectedItem.latest_check?.confidence ?? 0}/100</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("复核时间", "Reviewed At")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">
                        {formatDate(selectedItem.latest_check?.reviewed_at ?? null, language === "zh" ? "zh-CN" : "en-US")}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    {selectedItem.latest_check?.recommendation ?? t("没有检测记录。", "No check record.")}
                  </p>
                </div>

                <div className="rounded-md border border-zinc-200 p-4">
                  <h4 className="text-sm font-semibold text-zinc-950">{t("命中明细", "Match Details")}</h4>
                  <div className="mt-3 space-y-2">
                    {parseRuleMatches(selectedItem.latest_check?.matched_rules).length > 0 ? (
                      parseRuleMatches(selectedItem.latest_check?.matched_rules).map((match, index) => (
                        <div key={`${match.rule_id ?? "match"}-${index}`} className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
                          <p className="font-medium text-zinc-950">{match.label ?? t("规则", "Rule")}</p>
                          <p className="mt-1">
                            {t("命中词：", "Matched: ")}{match.matched ?? "-"} · {t("字段：", "Field: ")}{match.field ?? "-"}
                          </p>
                          {match.description ? <p className="mt-1 text-zinc-500">{match.description}</p> : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-500">{t("没有规则命中。", "No rule matches.")}</p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200 p-4">
                  <h4 className="text-sm font-semibold text-zinc-950">{t("复核操作", "Review Action")}</h4>
                  <div className="mt-3 space-y-3">
                    {reviewOptions.map((option) => (
                      <label key={option.value} className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 hover:bg-zinc-50">
                        <input
                          type="radio"
                          name="review-status"
                          value={option.value}
                          checked={reviewStatus === option.value}
                          onChange={() => setReviewStatus(option.value)}
                          className="mt-1 h-4 w-4 border-zinc-300"
                        />
                        <span>
                          <span className="block text-sm font-medium text-zinc-950">{t(option.zh, option.en)}</span>
                          <span className="mt-1 block text-xs text-zinc-500">{t(option.helperZh, option.helperEn)}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <label htmlFor="review-note" className="mt-4 block text-sm font-medium text-zinc-950">
                    {t("复核备注 / 授权依据", "Review Note / License Evidence")}
                  </label>
                  <textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    rows={4}
                    placeholder={t("例如：自有原创；购买了商用授权，订单号 xxx；品牌授权文件位于 xxx。", "Example: Original artwork; commercial license order xxx; brand authorization file at xxx.")}
                    className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />

                  <button
                    type="button"
                    onClick={() => void saveReview()}
                    disabled={isReviewSaving}
                    className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {isReviewSaving ? t("保存中...", "Saving...") : t("保存复核结果", "Save Review")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
