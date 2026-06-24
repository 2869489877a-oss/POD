"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import {
  fetchInfringementDashboard,
  type InfringementCheckRow,
  type InfringementListItem,
} from "@/lib/actions/infringement-checks";
import { infringementRuleEntries, infringementRuleStats, RULE_ENGINE_VERSION } from "@/lib/infringement/rules";
import { getDisplayImageSrc } from "@/lib/local-asset-url";
import type { InfringementReferenceLibraryType, InfringementRuleCategory } from "@/lib/infringement/types";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";

const CHECKS_PER_PAGE = 8;

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

type EvidenceQuality = "strong" | "standard" | "weak" | "visual_only" | "none";

type ScoreBreakdown = {
  field?: string;
  matched?: string;
  rule_id?: string;
  score?: number;
  severity?: string;
};

type DetectionEvidence = {
  evidence_quality?: EvidenceQuality;
  ocr_chars?: number;
  product_text_count?: number;
  score_breakdown?: ScoreBreakdown[];
  strong_match_count?: number;
  visual_review_reason?: string;
  visual_review_required?: boolean;
  weak_evidence_cap_applied?: boolean;
  weak_evidence_source?: "filename" | "metadata";
  weak_match_count?: number;
};

type RunChecksResponse = {
  checks?: InfringementCheckRow[];
  error?: string;
  job_id?: string;
  message?: string;
  queued?: boolean;
  total?: number;
};

type ImageJobProgressResponse = {
  error?: string;
  job?: {
    failed_count: number;
    id: string;
    status: string;
    success_count: number;
    total_count: number;
  };
};

type ReviewResponse = {
  check?: InfringementCheckRow;
  error?: string;
  ok?: boolean;
};

type ReferenceLibraryItemRow = {
  category: InfringementRuleCategory;
  description?: string | null;
  id: string;
  imageHash?: string | null;
  imageUrl?: string | null;
  libraryType: InfringementReferenceLibraryType;
  notes?: string | null;
  riskLevel: string;
  severity: string;
  source: "built_in" | "database";
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  terms: string[];
  title: string;
};

type BuiltInReferenceStats = {
  byCategory: Partial<Record<InfringementRuleCategory, number>>;
  totalHighRisk: number;
  totalTerms: number;
};

type ReferenceLibraryResponse = {
  built_in?: {
    high_risk_count?: number;
    sample?: ReferenceLibraryItemRow[];
    search_total?: number;
    stats?: BuiltInReferenceStats;
  };
  error?: string;
  items?: ReferenceLibraryItemRow[];
  setup_required?: boolean;
};

type CreateReferenceResponse = {
  error?: string;
  item?: ReferenceLibraryItemRow;
};

type SeedBuiltInResponse = {
  added?: number;
  error?: string;
  ok?: boolean;
  skipped?: number;
  total?: number;
};

type InfringementChecksManagerProps = {
  initialError?: string | null;
  initialItems: InfringementListItem[];
};

function getAssetPreviewUrl(item: InfringementListItem) {
  return (
    item.asset.preferred_design_url ??
    item.asset.print_extract_url ??
    item.asset.cutout_url ??
    item.asset.processed_url ??
    item.asset.original_url
  );
}

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

const evidenceQualityLabels: Record<EvidenceQuality, { en: string; zh: string }> = {
  none: { en: "No Evidence", zh: "无证据" },
  standard: { en: "Context", zh: "上下文" },
  strong: { en: "Strong", zh: "强证据" },
  visual_only: { en: "Visual Review", zh: "看图复核" },
  weak: { en: "Weak", zh: "弱证据" },
};

const evidenceQualityStyles: Record<EvidenceQuality, string> = {
  none: "bg-zinc-100 text-zinc-700",
  standard: "bg-sky-50 text-sky-700",
  strong: "bg-emerald-50 text-emerald-700",
  visual_only: "bg-cyan-50 text-cyan-700",
  weak: "bg-amber-50 text-amber-700",
};

const ruleCategoryLabels: Record<InfringementRuleCategory, { en: string; zh: string }> = {
  brand: { en: "Brand / Trademark", zh: "品牌 / 商标" },
  celebrity: { en: "Celebrity / Likeness", zh: "名人 / 肖像" },
  character: { en: "IP / Character", zh: "IP / 角色" },
  copyright_phrase: { en: "Derivative Copy", zh: "衍生文案" },
  logo: { en: "Logo / Mark", zh: "Logo / 标识" },
  marketplace: { en: "Marketplace Copy", zh: "平台文案" },
  sports: { en: "Sports / Team", zh: "体育 / 球队" },
  visual_review: { en: "Visual Review", zh: "视觉复核" },
};

const ruleSeverityLabels: Record<string, { en: string; zh: string }> = {
  critical: { en: "Critical", zh: "极高" },
  high: { en: "High", zh: "高" },
  low: { en: "Low", zh: "低" },
  medium: { en: "Medium", zh: "中" },
};

const ruleCategoryOptions: Array<{ value: "all" | InfringementRuleCategory; en: string; zh: string }> = [
  { en: "All Categories", value: "all", zh: "全部分类" },
  ...Object.entries(ruleCategoryLabels).map(([value, label]) => ({
    en: label.en,
    value: value as InfringementRuleCategory,
    zh: label.zh,
  })),
];

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

const emptyBuiltInReferenceStats: BuiltInReferenceStats = {
  byCategory: {},
  totalHighRisk: 0,
  totalTerms: 0,
};

function isCheckStatus(value: string): value is CheckStatus {
  return ["pending", "clear", "review", "risky", "blocked"].includes(value);
}

function isRiskLevel(value: string): value is RiskLevel {
  return ["unknown", "low", "medium", "high", "critical"].includes(value);
}

function isCopyrightStatus(value: string): value is CopyrightStatus {
  return ["unknown", "owned", "commercial_ok", "risky", "forbidden"].includes(value);
}

function isEvidenceQuality(value: unknown): value is EvidenceQuality {
  return (
    typeof value === "string" &&
    ["strong", "standard", "weak", "visual_only", "none"].includes(value)
  );
}

function parseRuleMatches(value: unknown): RuleMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is RuleMatch => typeof item === "object" && item !== null);
}

function parseDetectionEvidence(value: unknown): DetectionEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const scoreBreakdown = Array.isArray(record.score_breakdown)
    ? record.score_breakdown.filter((item): item is ScoreBreakdown => typeof item === "object" && item !== null)
    : undefined;

  return {
    evidence_quality: isEvidenceQuality(record.evidence_quality) ? record.evidence_quality : undefined,
    ocr_chars: typeof record.ocr_chars === "number" ? record.ocr_chars : undefined,
    product_text_count: typeof record.product_text_count === "number" ? record.product_text_count : undefined,
    score_breakdown: scoreBreakdown,
    strong_match_count: typeof record.strong_match_count === "number" ? record.strong_match_count : undefined,
    visual_review_reason: typeof record.visual_review_reason === "string" ? record.visual_review_reason : undefined,
    visual_review_required: typeof record.visual_review_required === "boolean" ? record.visual_review_required : undefined,
    weak_evidence_cap_applied: typeof record.weak_evidence_cap_applied === "boolean" ? record.weak_evidence_cap_applied : undefined,
    weak_evidence_source: record.weak_evidence_source === "filename" || record.weak_evidence_source === "metadata"
      ? record.weak_evidence_source
      : undefined,
    weak_match_count: typeof record.weak_match_count === "number" ? record.weak_match_count : undefined,
  };
}

function getScoreBreakdownForMatch(evidence: DetectionEvidence | null, match: RuleMatch) {
  return evidence?.score_breakdown?.find((item) => (
    item.rule_id === match.rule_id &&
    item.field === match.field &&
    item.matched === match.matched
  ));
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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function isVisualReviewMatch(match: RuleMatch) {
  return match.rule_id === "visual-review-required";
}

function getDisplayRiskLabel(riskLevel: RiskLevel, evidence: DetectionEvidence | null) {
  if (evidence?.visual_review_required) {
    return { en: "Visual Check", zh: "看图确认" };
  }

  return riskLevelLabels[riskLevel];
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
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [checkingAssetIds, setCheckingAssetIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<InfringementListItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<Exclude<CheckStatus, "pending">>("review");
  const [reviewNote, setReviewNote] = useState("");
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [ruleSearchQuery, setRuleSearchQuery] = useState("");
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<"all" | InfringementRuleCategory>("all");
  const [builtInReferenceItems, setBuiltInReferenceItems] = useState<ReferenceLibraryItemRow[]>([]);
  const [builtInReferenceStats, setBuiltInReferenceStats] =
    useState<BuiltInReferenceStats>(emptyBuiltInReferenceStats);
  const [builtInSearchTotal, setBuiltInSearchTotal] = useState(0);
  const [referenceItems, setReferenceItems] = useState<ReferenceLibraryItemRow[]>([]);
  const [referenceLibraryError, setReferenceLibraryError] = useState<string | null>(null);
  const [referenceSetupRequired, setReferenceSetupRequired] = useState(false);
  const [referenceSearchQuery, setReferenceSearchQuery] = useState("");
  const [newReferenceType, setNewReferenceType] = useState<InfringementReferenceLibraryType>("high_risk");
  const [newReferenceTitle, setNewReferenceTitle] = useState("");
  const [newReferenceTerms, setNewReferenceTerms] = useState("");
  const [newReferenceImageUrl, setNewReferenceImageUrl] = useState("");
  const [isReferenceSaving, setIsReferenceSaving] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportMessage, setBulkImportMessage] = useState<string | null>(null);
  const [isSeedingBuiltIn, setIsSeedingBuiltIn] = useState(false);
  const [seedBuiltInMessage, setSeedBuiltInMessage] = useState<string | null>(null);

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

  const checksTotalPages = Math.max(1, Math.ceil(visibleItems.length / CHECKS_PER_PAGE));
  const currentPage = Math.min(page, checksTotalPages);
  const pagedItems = useMemo(
    () => visibleItems.slice((currentPage - 1) * CHECKS_PER_PAGE, currentPage * CHECKS_PER_PAGE),
    [visibleItems, currentPage],
  );

  const visibleRuleEntries = useMemo(() => {
    const keyword = ruleSearchQuery.trim().toLowerCase();

    return infringementRuleEntries.filter((entry) => {
      if (ruleCategoryFilter !== "all" && entry.category !== ruleCategoryFilter) return false;
      if (!keyword) return true;

      const searchable = [
        entry.term,
        entry.labelEn,
        entry.labelZh,
        entry.descriptionEn,
        entry.descriptionZh,
        entry.policyBasisEn,
        entry.policyBasisZh,
        entry.sourceLabel,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [ruleCategoryFilter, ruleSearchQuery]);

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
  const numberFormatter = useMemo(() => new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US"), [language]);
  const displayedRuleEntries = visibleRuleEntries.slice(0, 80);
  const referenceKeyword = referenceSearchQuery.trim().toLowerCase();
  const displayedHighRiskReferences = useMemo(() => {
    return builtInReferenceItems
      .filter((item) => {
        if (!referenceKeyword) return true;
        return [
          item.title,
          item.description,
          item.category,
          item.sourceLabel,
          ...item.terms,
        ]
          .join(" ")
          .toLowerCase()
          .includes(referenceKeyword);
      })
      .sort((left, right) => {
        if (left.imageHash && !right.imageHash) return -1;
        if (!left.imageHash && right.imageHash) return 1;
        if (left.category === "celebrity" && right.category !== "celebrity") return -1;
        if (left.category !== "celebrity" && right.category === "celebrity") return 1;
        return left.title.localeCompare(right.title);
      })
      .slice(0, 80);
  }, [builtInReferenceItems, referenceKeyword]);
  const displayedDatabaseReferences = useMemo(() => {
    return referenceItems
      .filter((item) => {
        if (!referenceKeyword) return true;
        return [
          item.title,
          item.category,
          item.sourceLabel,
          item.imageUrl,
          ...item.terms,
        ]
          .join(" ")
          .toLowerCase()
          .includes(referenceKeyword);
      })
      .slice(0, 12);
  }, [referenceItems, referenceKeyword]);
  const databaseHighRiskCount = referenceItems.filter((item) => item.libraryType === "high_risk").length;
  const databaseAllowlistCount = referenceItems.filter((item) => item.libraryType === "allowlist").length;

  async function loadReferenceLibrary(query = referenceSearchQuery, signal?: AbortSignal) {
    try {
      const keyword = query.trim();
      const url = keyword
        ? `/api/infringement-reference-library?q=${encodeURIComponent(keyword)}`
        : "/api/infringement-reference-library";
      const response = await fetch(url, { cache: "no-store", signal });
      const data = (await response.json()) as ReferenceLibraryResponse;

      if (!response.ok) {
        throw new Error(data.error ?? t("读取参考库失败", "Failed to load reference library"));
      }

      setBuiltInReferenceItems(data.built_in?.sample ?? []);
      setBuiltInReferenceStats(data.built_in?.stats ?? emptyBuiltInReferenceStats);
      setBuiltInSearchTotal(data.built_in?.search_total ?? data.built_in?.sample?.length ?? 0);
      setReferenceItems(data.items ?? []);
      setReferenceSetupRequired(Boolean(data.setup_required));
      setReferenceLibraryError(null);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        return;
      }

      setReferenceLibraryError(
        requestError instanceof Error ? requestError.message : t("读取参考库失败", "Failed to load reference library"),
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        void loadReferenceLibrary(referenceSearchQuery, controller.signal);
      },
      referenceSearchQuery.trim() ? 250 : 0,
    );

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceSearchQuery]);

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
    setCheckingAssetIds(new Set(assetIds));
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

      if (data.queued && data.job_id) {
        await pollInfringementJob(data.job_id, assetIds.length);
      }

      setMessage(data.queued ? t("后台侵权检测已完成", "Background infringement check complete") : data.message ?? t("侵权检测已完成", "Infringement check complete"));
      await refreshDashboard();
    } catch (requestError) {
      setMessage(null);
      setError(requestError instanceof Error ? requestError.message : t("侵权检测失败", "Infringement check failed"));
    } finally {
      setIsRunning(false);
      setCheckingAssetIds(new Set());
    }
  }

  async function pollInfringementJob(jobId: string, fallbackTotal: number) {
    const deadline = Date.now() + 10 * 60_000;

    for (;;) {
      await sleep(1500);

      const response = await fetch(`/api/image-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const data = (await response.json()) as ImageJobProgressResponse;

      if (!response.ok || data.error || !data.job) {
        throw new Error(data.error ?? t("读取后台检测进度失败", "Failed to read background check progress"));
      }

      const total = data.job.total_count || fallbackTotal;
      const done = data.job.success_count + data.job.failed_count;
      setMessage(t(
        `后台检测中：${done}/${total}，成功 ${data.job.success_count}，失败 ${data.job.failed_count}`,
        `Background checking: ${done}/${total}, succeeded ${data.job.success_count}, failed ${data.job.failed_count}`,
      ));

      if (data.job.status === "completed" || data.job.status === "failed" || data.job.status === "partial_failed") {
        break;
      }

      if (Date.now() > deadline) {
        throw new Error(t("后台检测仍在运行，请稍后刷新页面查看结果", "Background check is still running. Refresh later to see results."));
      }
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

  async function saveReferenceItem() {
    const title = newReferenceTitle.trim();
    const terms = newReferenceTerms.trim();
    const imageUrl = newReferenceImageUrl.trim();

    if (!title && !terms && !imageUrl) {
      setReferenceLibraryError(t("请至少填写标题、关键词或图片 URL", "Enter at least a title, terms or image URL"));
      return;
    }

    setIsReferenceSaving(true);
    setReferenceLibraryError(null);

    try {
      const response = await fetch("/api/infringement-reference-library", {
        body: JSON.stringify({
          category: newReferenceType === "allowlist" ? "marketplace" : "celebrity",
          image_url: imageUrl || undefined,
          library_type: newReferenceType,
          risk_level: newReferenceType === "allowlist" ? "unknown" : "high",
          severity: newReferenceType === "allowlist" ? "low" : "high",
          terms,
          title,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as CreateReferenceResponse;

      if (!response.ok) {
        throw new Error(data.error ?? t("保存参考项失败", "Failed to save reference item"));
      }

      setNewReferenceTitle("");
      setNewReferenceTerms("");
      setNewReferenceImageUrl("");
      await loadReferenceLibrary();
    } catch (requestError) {
      setReferenceLibraryError(
        requestError instanceof Error ? requestError.message : t("保存参考项失败", "Failed to save reference item"),
      );
    } finally {
      setIsReferenceSaving(false);
    }
  }

  async function bulkImportReferenceUrls() {
    const urls = Array.from(
      new Set(
        bulkUrls
          .split(/\s+/)
          .map((item) => item.trim())
          .filter((item) => /^https?:\/\//i.test(item)),
      ),
    );

    if (urls.length === 0) {
      setReferenceLibraryError(t("请粘贴至少一个 http(s) 图片 URL（一行一个）", "Paste at least one http(s) image URL (one per line)"));
      return;
    }

    setIsBulkImporting(true);
    setReferenceLibraryError(null);
    setBulkImportMessage(t(`正在导入 0/${urls.length}...`, `Importing 0/${urls.length}...`));

    const CHUNK = 10;
    let added = 0;
    let skipped = 0;
    let failed = 0;
    let done = 0;

    try {
      for (let index = 0; index < urls.length; index += CHUNK) {
        const chunk = urls.slice(index, index + CHUNK);
        const response = await fetch("/api/infringement-reference-library", {
          body: JSON.stringify({ image_urls: chunk, library_type: newReferenceType }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = (await response.json()) as { added?: number; error?: string; failed?: number; skipped?: number };

        if (!response.ok) {
          throw new Error(data.error ?? t("批量导入失败", "Bulk import failed"));
        }

        added += data.added ?? 0;
        skipped += data.skipped ?? 0;
        failed += data.failed ?? 0;
        done += chunk.length;
        setBulkImportMessage(t(`正在导入 ${done}/${urls.length}...`, `Importing ${done}/${urls.length}...`));
      }

      setBulkImportMessage(
        t(
          `导入完成:新增 ${added}、跳过重复 ${skipped}、失败 ${failed}`,
          `Done: ${added} added, ${skipped} skipped, ${failed} failed`,
        ),
      );
      setBulkUrls("");
      await loadReferenceLibrary();
    } catch (requestError) {
      setReferenceLibraryError(
        requestError instanceof Error ? requestError.message : t("批量导入失败", "Bulk import failed"),
      );
    } finally {
      setIsBulkImporting(false);
    }
  }

  async function seedBuiltInReferenceLibrary() {
    setIsSeedingBuiltIn(true);
    setReferenceLibraryError(null);
    setSeedBuiltInMessage(t("正在导入内置高风险库...", "Importing built-in high-risk library..."));

    try {
      const response = await fetch("/api/infringement-reference-library", {
        body: JSON.stringify({ action: "seed_built_in" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as SeedBuiltInResponse;

      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? t("导入内置参考库失败", "Failed to import built-in reference library"));
      }

      setSeedBuiltInMessage(
        t(
          `内置库导入完成:新增 ${data.added ?? 0}、已存在 ${data.skipped ?? 0}、总计 ${data.total ?? 0}`,
          `Built-in library imported: ${data.added ?? 0} added, ${data.skipped ?? 0} already existed, ${data.total ?? 0} total`,
        ),
      );
      await loadReferenceLibrary();
    } catch (requestError) {
      setSeedBuiltInMessage(null);
      setReferenceLibraryError(
        requestError instanceof Error
          ? requestError.message
          : t("导入内置参考库失败", "Failed to import built-in reference library"),
      );
    } finally {
      setIsSeedingBuiltIn(false);
    }
  }

  const selectedEvidence = selectedItem ? parseDetectionEvidence(selectedItem.latest_check?.evidence) : null;
  const selectedRuleMatches = selectedItem ? parseRuleMatches(selectedItem.latest_check?.matched_rules) : [];
  const selectedActionableRuleMatches = selectedRuleMatches.filter((match) => !isVisualReviewMatch(match));
  const selectedRiskLabel = selectedItem
    ? getDisplayRiskLabel(getRiskLevel(selectedItem.latest_check), selectedEvidence)
    : riskLevelLabels.unknown;

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
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
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
              onChange={(event) => {
                setFilter(event.target.value as typeof filter);
                setPage(1);
              }}
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
            className="ui-press self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.asset.id))
              ? t("取消全选", "Deselect All")
              : t("全选当前", "Select Current")}
          </button>

          <button
            type="button"
            onClick={() => void refreshDashboard()}
            disabled={isRefreshing || isRunning}
            className="ui-press self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
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
            className="ui-press inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-300"
          >
            {isRunning ? (
              <>
                <span className="ui-spinner ui-spinner-md text-cyan-300" aria-hidden="true" />
                <span>{t("检测中...", "Checking...")}</span>
              </>
            ) : (
              t("检测所选素材", "Check Selected")
            )}
          </button>
          <button
            type="button"
            onClick={() => void runChecks(visibleItems.filter((item) => getLatestStatus(item) === "unchecked").map((item) => item.asset.id))}
            disabled={isRunning || visibleItems.every((item) => getLatestStatus(item) !== "unchecked")}
            className="ui-press rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {t("检测当前未检测", "Check Visible Unchecked")}
          </button>
        </div>

        {isRunning ? (
          <div className="ui-enter ui-scan-panel mt-4 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-800">
            <div className="relative flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="ui-spinner ui-spinner-md text-cyan-300" aria-hidden="true" />
                <span className="truncate">{t(`规则引擎正在扫描 ${checkingAssetIds.size} 张素材...`, `Rule engine is scanning ${checkingAssetIds.size} asset(s)...`)}</span>
              </span>
              <span className="shrink-0 font-semibold">{t("运行中", "Running")}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cyan-100">
              <div className="ui-progress-fill h-full w-2/3 rounded-full bg-cyan-500" />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              {t("服装印花规则库", "Apparel Print Rule Library")}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">
              {t("按规则库算法辅助判定侵权风险", "Rule-based infringement risk scoring")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "规则库围绕衣服印花、T恤、卫衣、球衣、贴纸、烫画和 POD 上架文案扩展；普通服装词不会单独触发风险，只有与品牌、角色、赛事、名人、Logo 或衍生文案组合时才会提高风险。",
                "The library is expanded around apparel prints, shirts, hoodies, jerseys, stickers, transfers and POD listing copy. Generic apparel terms do not trigger risk by themselves; risk increases when they are paired with brands, characters, events, celebrities, logos or derivative-work wording.",
              )}
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">{numberFormatter.format(infringementRuleStats.totalTerms)} {t("条规则项", "rule entries")}</p>
            <p className="mt-1 text-xs">{t("版本", "Version")} {RULE_ENGINE_VERSION}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium text-red-700">{t("极高风险", "Critical")}</p>
            <p className="mt-2 text-2xl font-semibold text-red-800">
              {numberFormatter.format(infringementRuleStats.bySeverity.critical)}
            </p>
          </div>
          <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-medium text-orange-700">{t("高风险", "High")}</p>
            <p className="mt-2 text-2xl font-semibold text-orange-800">
              {numberFormatter.format(infringementRuleStats.bySeverity.high)}
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-700">{t("中风险", "Medium")}</p>
            <p className="mt-2 text-2xl font-semibold text-amber-800">
              {numberFormatter.format(infringementRuleStats.bySeverity.medium)}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-medium text-zinc-500">{t("低风险", "Low")}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {numberFormatter.format(infringementRuleStats.bySeverity.low)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">{t("判定算法", "Scoring Algorithm")}</h3>
            <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
              <p>{t("极高风险基础分 98，直接进入禁用。", "Critical starts at 98 and is blocked.")}</p>
              <p>{t("高风险基础分 80，进入高风险复核。", "High starts at 80 and needs review.")}</p>
              <p>{t("中风险基础分 55，进入人工复核。", "Medium starts at 55 and needs manual review.")}</p>
              <p>{t("多命中每条额外 +3 分，最高 100。", "Each extra match adds 3 points, capped at 100.")}</p>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">{t("规则分类", "Rule Categories")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(infringementRuleStats.byCategory).map(([category, count]) => (
                <span key={category} className="rounded-md bg-white px-3 py-2 text-xs font-medium text-zinc-700">
                  {t(ruleCategoryLabels[category as InfringementRuleCategory].zh, ruleCategoryLabels[category as InfringementRuleCategory].en)}
                  <span className="ml-2 text-zinc-500">{numberFormatter.format(count)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <label htmlFor="rule-search" className="block text-sm font-medium text-zinc-950">
              {t("搜索规则库", "Search Rules")}
            </label>
            <input
              id="rule-search"
              value={ruleSearchQuery}
              onChange={(event) => setRuleSearchQuery(event.target.value)}
              placeholder={t("搜索品牌、角色、Logo、赛事、平台文案或服装场景", "Search brand, character, logo, event, marketplace copy or apparel context")}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label htmlFor="rule-category" className="block text-sm font-medium text-zinc-950">
              {t("规则分类", "Category")}
            </label>
            <select
              id="rule-category"
              value={ruleCategoryFilter}
              onChange={(event) => setRuleCategoryFilter(event.target.value as typeof ruleCategoryFilter)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {ruleCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.zh, option.en)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
          <div className="grid grid-cols-[1.2fr_120px_1fr] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <span>{t("规则项", "Rule Entry")}</span>
            <span>{t("风险", "Risk")}</span>
            <span>{t("依据 / 来源", "Basis / Source")}</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-200 bg-white">
            {displayedRuleEntries.map((entry) => (
              <div key={entry.id} className="grid gap-3 px-4 py-3 text-sm text-zinc-700 md:grid-cols-[1.2fr_120px_1fr]">
                <div>
                  <p className="font-semibold text-zinc-950">{entry.term}</p>
                  <p className="mt-1 text-xs text-zinc-500">{t(entry.labelZh, entry.labelEn)}</p>
                </div>
                <div>
                  <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {t(ruleSeverityLabels[entry.severity].zh, ruleSeverityLabels[entry.severity].en)}
                  </span>
                </div>
                <div>
                  <p className="line-clamp-2 text-xs leading-5 text-zinc-600">
                    {t(entry.policyBasisZh ?? entry.descriptionZh, entry.policyBasisEn ?? entry.descriptionEn)}
                  </p>
                  {entry.sourceUrl ? (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      {entry.sourceLabel ?? entry.sourceUrl}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {t(
            `当前显示 ${displayedRuleEntries.length} / ${visibleRuleEntries.length} 条过滤结果。规则库只做风险筛查，不等同法律意见；最终上架仍需人工确认授权、商标和图片来源。`,
            `Showing ${displayedRuleEntries.length} / ${visibleRuleEntries.length} filtered entries. The library is a risk screen, not legal advice; final listing still requires manual rights and source review.`,
          )}
        </p>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              {t("高风险参考库 / 白名单库", "High-Risk Reference / Allowlist")}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">
              {t("明星、图片 hash 和授权白名单管理", "Celebrity, image hash and license allowlist management")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              {t(
                "内置库覆盖欧美为主的明星、乐队、运动员、演员和公众人物；图片不直接打包进仓库，用户可添加已确认来源的图片 URL，系统会保存感知 hash 用于后续相似图命中。",
                "The built-in library covers mostly Western celebrities, bands, athletes, actors and public figures. Photos are not bundled in the repo; add verified image URLs to store perceptual hashes for later similar-image hits.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void seedBuiltInReferenceLibrary()}
              disabled={isSeedingBuiltIn}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSeedingBuiltIn ? t("导入中...", "Importing...") : t("一键导入内置库", "Import Built-in Library")}
            </button>
            <button
              type="button"
              onClick={() => void loadReferenceLibrary()}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              {t("刷新参考库", "Refresh Library")}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium text-red-600">{t("内置高风险项", "Built-in High-Risk")}</p>
            <p className="mt-2 text-2xl font-semibold text-red-900">
              {numberFormatter.format(builtInReferenceStats.totalHighRisk)}
            </p>
            <p className="mt-1 text-xs text-red-700">
              {numberFormatter.format(builtInReferenceStats.totalTerms)} {t("个匹配词", "terms")}
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-700">{t("明星参考项", "Celebrity References")}</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">
              {numberFormatter.format(builtInReferenceStats.byCategory.celebrity ?? 0)}
            </p>
            <p className="mt-1 text-xs text-amber-700">{t("含演员、歌手、体育明星和组合", "Actors, musicians, athletes and groups")}</p>
          </div>
          <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-medium text-orange-700">{t("用户高风险库", "User High-Risk")}</p>
            <p className="mt-2 text-2xl font-semibold text-orange-900">{numberFormatter.format(databaseHighRiskCount)}</p>
            <p className="mt-1 text-xs text-orange-700">{t("支持 URL 自动生成图片 hash", "URL to image hash supported")}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium text-emerald-700">{t("白名单", "Allowlist")}</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">{numberFormatter.format(databaseAllowlistCount)}</p>
            <p className="mt-1 text-xs text-emerald-700">{t("用于已授权或自有素材", "For licensed or owned assets")}</p>
          </div>
        </div>

        {referenceSetupRequired ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {t(
              "数据库参考库表尚未创建。请先执行最新 Supabase migration；内置高风险库仍会参与检测。",
              "The database reference table has not been created. Run the latest Supabase migration first; the built-in high-risk library still participates in detection.",
            )}
          </div>
        ) : null}

        {referenceLibraryError ? (
          <div className="mt-4 whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {referenceLibraryError}
          </div>
        ) : null}

        {seedBuiltInMessage ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {seedBuiltInMessage}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div>
            <label htmlFor="reference-search" className="block text-sm font-medium text-zinc-950">
              {t("搜索高风险参考库", "Search High-Risk References")}
            </label>
            <input
              id="reference-search"
              value={referenceSearchQuery}
              onChange={(event) => setReferenceSearchQuery(event.target.value)}
              placeholder={t("搜索明星、球队号码、乐队、图片来源或服装语境", "Search celebrities, jersey numbers, bands, image source or apparel context")}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />

            <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
              <div className="grid gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:grid-cols-[1fr_130px_1.3fr]">
                <span>{t("参考项", "Reference")}</span>
                <span>{t("分类", "Category")}</span>
                <span>{t("命中词 / 图片来源", "Terms / Image Source")}</span>
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-200 bg-white">
                {displayedHighRiskReferences.map((item) => (
                  <div key={item.id} className="grid gap-3 px-4 py-3 text-sm text-zinc-700 md:grid-cols-[1fr_130px_1.3fr]">
                    <div>
                      <p className="font-semibold text-zinc-950">{item.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.imageHash ? t("含图片 hash 样例", "Image hash sample included") : item.sourceLabel}
                      </p>
                    </div>
                    <span className="h-fit rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                      {t(ruleCategoryLabels[item.category].zh, ruleCategoryLabels[item.category].en)}
                    </span>
                    <div>
                      <p className="line-clamp-2 text-xs leading-5 text-zinc-600">
                        {item.terms.slice(0, 8).join(", ")}
                      </p>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          {item.category === "celebrity"
                            ? t("查看公开图片来源", "Open public image source")
                            : t("查看规则来源", "Open rule source")}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {t(
                `当前显示 ${displayedHighRiskReferences.length} / ${builtInSearchTotal} 条匹配。搜索会查询完整内置库；需要图片级识别时，请把已确认来源的图片 URL 加到用户高风险库或白名单。`,
                `Showing ${displayedHighRiskReferences.length} / ${builtInSearchTotal} matches. Search queries the full built-in library; add verified image URLs to the user high-risk library or allowlist when image-level matching is needed.`,
              )}
            </p>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">{t("添加参考项", "Add Reference")}</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              {t(
                "高风险用于拦截侵权嫌疑，白名单用于已授权/自有素材。填写图片 URL 时会自动计算 hash，不会保存图片文件。",
                "High-risk items block suspicious assets; allowlist items mark licensed or owned assets. Image URLs are hashed without storing image files.",
              )}
            </p>

            <label htmlFor="reference-type" className="mt-4 block text-xs font-medium text-zinc-600">
              {t("库类型", "Library Type")}
            </label>
            <select
              id="reference-type"
              value={newReferenceType}
              onChange={(event) => setNewReferenceType(event.target.value as InfringementReferenceLibraryType)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="high_risk">{t("高风险库", "High-Risk Library")}</option>
              <option value="allowlist">{t("白名单库", "Allowlist")}</option>
            </select>

            <label htmlFor="reference-title" className="mt-4 block text-xs font-medium text-zinc-600">
              {t("标题", "Title")}
            </label>
            <input
              id="reference-title"
              value={newReferenceTitle}
              onChange={(event) => setNewReferenceTitle(event.target.value)}
              placeholder={t("例如：Dennis Rodman 样例 / 自有天使翅膀图", "Example: Dennis Rodman sample / Owned angel wings")}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />

            <label htmlFor="reference-terms" className="mt-4 block text-xs font-medium text-zinc-600">
              {t("关键词 / 别名", "Terms / Aliases")}
            </label>
            <textarea
              id="reference-terms"
              value={newReferenceTerms}
              onChange={(event) => setNewReferenceTerms(event.target.value)}
              rows={4}
              placeholder={t("一行一个，或用逗号分隔", "One per line, or comma-separated")}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />

            <label htmlFor="reference-image-url" className="mt-4 block text-xs font-medium text-zinc-600">
              {t("图片 URL（可选）", "Image URL (optional)")}
            </label>
            <input
              id="reference-image-url"
              value={newReferenceImageUrl}
              onChange={(event) => setNewReferenceImageUrl(event.target.value)}
              placeholder="https://..."
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />

            <button
              type="button"
              onClick={() => void saveReferenceItem()}
              disabled={isReferenceSaving}
              className="mt-4 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isReferenceSaving ? t("保存中...", "Saving...") : t("保存参考项", "Save Reference")}
            </button>

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <h4 className="text-sm font-semibold text-zinc-950">{t("批量导入图片 URL", "Bulk Import Image URLs")}</h4>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                {t(
                  "一行一个图片 URL,逐张算指纹入库(用上面选的库类型)。适合一次缓存一批已知图;只能命中和这些图几乎一样的重复 / 近似上传。",
                  "One image URL per line. Each is hashed and added (using the library type above). Good for caching a batch of known images; only matches near-identical re-uploads of those images.",
                )}
              </p>
              <textarea
                value={bulkUrls}
                onChange={(event) => setBulkUrls(event.target.value)}
                rows={5}
                disabled={isBulkImporting}
                placeholder={"https://...\nhttps://..."}
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
              <button
                type="button"
                onClick={() => void bulkImportReferenceUrls()}
                disabled={isBulkImporting}
                className="mt-3 w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {isBulkImporting ? t("导入中...", "Importing...") : t("批量导入 URL", "Bulk Import URLs")}
              </button>
              {bulkImportMessage ? (
                <p className="mt-2 text-xs text-emerald-700">{bulkImportMessage}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-zinc-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">{t("用户维护参考项", "User-Maintained References")}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                {t("这里展示数据库中的高风险库和白名单项。", "Database high-risk and allowlist entries are shown here.")}
              </p>
            </div>
            <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-zinc-600">
              {numberFormatter.format(referenceItems.length)} {t("项", "items")}
            </span>
          </div>
          <div className="divide-y divide-zinc-200 bg-white">
            {displayedDatabaseReferences.length > 0 ? (
              displayedDatabaseReferences.map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-3 text-sm text-zinc-700 md:grid-cols-[1fr_120px_1.5fr]">
                  <div>
                    <p className="font-semibold text-zinc-950">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.imageHash ? t("已保存图片 hash", "Image hash stored") : t("仅关键词", "Terms only")}</p>
                  </div>
                  <span className={[
                    "h-fit rounded-md px-2.5 py-1 text-xs font-medium",
                    item.libraryType === "allowlist" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                  ].join(" ")}>
                    {item.libraryType === "allowlist" ? t("白名单", "Allowlist") : t("高风险", "High-Risk")}
                  </span>
                  <p className="line-clamp-2 text-xs leading-5 text-zinc-600">
                    {[...item.terms.slice(0, 8), item.imageUrl ? t("含图片 URL", "image URL") : ""].filter(Boolean).join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-zinc-500">
                {t("暂无用户维护参考项。", "No user-maintained references yet.")}
              </div>
            )}
          </div>
        </div>
      </section>

      {message ? (
        <div className="ui-enter rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="ui-enter whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
        {pagedItems.map((item) => {
          const status = getLatestStatus(item);
          const checkStatus = status === "unchecked" ? "pending" : status;
          const riskLevel = getRiskLevel(item.latest_check);
          const copyrightStatus = getCopyrightStatus(item.asset.copyright_status);
          const matches = parseRuleMatches(item.latest_check?.matched_rules);
          const evidence = parseDetectionEvidence(item.latest_check?.evidence);
          const evidenceQuality = evidence.evidence_quality ?? "none";
          const actionableMatches = matches.filter((match) => !isVisualReviewMatch(match));
          const displayRiskLabel = getDisplayRiskLabel(riskLevel, evidence);
          const previewUrl = getAssetPreviewUrl(item);
          const isSelected = selectedIds.has(item.asset.id);
          const isChecking = checkingAssetIds.has(item.asset.id);

          return (
            <article
              key={item.asset.id}
              data-task-active={isChecking}
              className={[
                "ui-enter ui-lift ui-task-card overflow-hidden rounded-md border bg-white transition",
                isSelected ? "border-zinc-950 ring-2 ring-zinc-950/10" : "border-zinc-200",
              ].join(" ")}
            >
              <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                <div className="relative min-h-[210px] bg-zinc-100">
                  <Image
                    src={getDisplayImageSrc(previewUrl)}
                    alt={item.asset.filename}
                    fill
                    sizes="220px"
                    className="object-contain"
                  />
                  <label className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAsset(item.asset.id)}
                      disabled={isChecking}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("选择", "Select")}
                  </label>
                  {isChecking ? (
                    <div className="ui-task-overlay z-20">
                      <span className="ui-spinner ui-spinner-md text-cyan-300" aria-hidden="true" />
                      <span className="ui-task-label">{t("检测中", "Checking")}</span>
                    </div>
                  ) : null}
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
                      <span className={["ui-status-pop rounded-md px-2.5 py-1 text-xs font-medium", checkStatusStyles[checkStatus]].join(" ")}>
                        {status === "unchecked" ? t("未检测", "Unchecked") : t(checkStatusLabels[checkStatus].zh, checkStatusLabels[checkStatus].en)}
                      </span>
                      <span className={["ui-status-pop rounded-md px-2.5 py-1 text-xs font-medium", copyrightStyles[copyrightStatus]].join(" ")}>
                        {t(copyrightLabels[copyrightStatus].zh, copyrightLabels[copyrightStatus].en)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 text-xs text-zinc-600 sm:grid-cols-4">
                    <div>
                      <p className="text-zinc-500">{t("风险等级", "Risk")}</p>
                      <p className="mt-1 font-medium text-zinc-950">{t(displayRiskLabel.zh, displayRiskLabel.en)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">{t("证据强度", "Evidence")}</p>
                      <p className="mt-1">
                        <span className={["ui-status-pop rounded-md px-2 py-1 font-medium", evidenceQualityStyles[evidenceQuality]].join(" ")}>
                          {t(evidenceQualityLabels[evidenceQuality].zh, evidenceQualityLabels[evidenceQuality].en)}
                        </span>
                      </p>
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

                  {evidence.visual_review_required ? (
                    <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs leading-5 text-cyan-800">
                      {t(
                        "当前只是缺少可自动判断的文字、哈希或商品上下文，需要人工看图确认；这不是规则库命中，也不代表已经侵权。",
                        "This image only needs a visual check because reliable text, hash, or product context is missing. It is not a rule hit and does not mean infringement was found.",
                      )}
                    </div>
                  ) : actionableMatches.length > 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-800">{t("命中规则", "Matched Rules")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {actionableMatches.slice(0, 5).map((match, index) => (
                          <span key={`${match.rule_id ?? "rule"}-${index}`} className="rounded bg-white px-2 py-1 text-xs text-amber-800">
                            {match.label ?? t("规则", "Rule")}：{match.matched ?? "-"}
                          </span>
                        ))}
                        {actionableMatches.length > 5 ? <span className="text-xs text-amber-700">+{actionableMatches.length - 5}</span> : null}
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
                      className="ui-press rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      {isChecking ? t("检测中", "Checking") : t("重新检测", "Re-check")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openReview(item)}
                      disabled={!item.latest_check}
                      className="ui-press rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {t("人工复核", "Review")}
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-press rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
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

      {visibleItems.length > 0 ? (
        <Pagination
          page={currentPage}
          totalPages={checksTotalPages}
          total={visibleItems.length}
          unitZh="张"
          unitEn="assets"
          onChange={setPage}
        />
      ) : null}

      {selectedItem ? (
        <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6" role="dialog" aria-modal="true">
          <div className="ui-modal-panel max-h-full w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-xl">
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
                <div className="relative min-h-[360px] overflow-hidden rounded-md bg-zinc-100">
                  <Image
                    src={getDisplayImageSrc(getAssetPreviewUrl(selectedItem))}
                    alt={selectedItem.asset.filename}
                    fill
                    sizes="(min-width: 1024px) 480px, 90vw"
                    className="object-contain"
                  />
                </div>
                <a
                  href={getAssetPreviewUrl(selectedItem)}
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
                        {t(selectedRiskLabel.zh, selectedRiskLabel.en)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("证据强度", "Evidence")}</dt>
                      <dd className="mt-1">
                        {(() => {
                          const quality = selectedEvidence?.evidence_quality ?? "none";
                          return (
                            <span className={["rounded-md px-2 py-1 text-xs font-medium", evidenceQualityStyles[quality]].join(" ")}>
                              {t(evidenceQualityLabels[quality].zh, evidenceQualityLabels[quality].en)}
                            </span>
                          );
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("置信分", "Score")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">{selectedItem.latest_check?.confidence ?? 0}/100</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("强 / 弱命中", "Strong / Weak")}</dt>
                      <dd className="mt-1 font-medium text-zinc-950">
                        {selectedEvidence?.strong_match_count ?? 0} / {selectedEvidence?.weak_match_count ?? 0}
                      </dd>
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
                    {selectedEvidence?.visual_review_required ? (
                      <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-800">
                        {t(
                          "当前只是缺少可自动判断的文字、哈希或商品上下文，需要人工看图确认；这不是规则库命中，也不代表已经侵权。",
                          "This image only needs a visual check because reliable text, hash, or product context is missing. It is not a rule hit and does not mean infringement was found.",
                        )}
                      </div>
                    ) : selectedActionableRuleMatches.length > 0 ? (
                      selectedActionableRuleMatches.map((match, index) => {
                        const score = getScoreBreakdownForMatch(selectedEvidence, match)?.score;

                        return (
                          <div key={`${match.rule_id ?? "match"}-${index}`} className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-zinc-950">{match.label ?? t("规则", "Rule")}</p>
                              {typeof score === "number" ? (
                                <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-600">
                                  {t("证据分", "Evidence Score")} {score}/100
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1">
                              {t("命中词：", "Matched: ")}{match.matched ?? "-"} · {t("字段：", "Field: ")}{match.field ?? "-"}
                            </p>
                            {match.description ? <p className="mt-1 text-zinc-500">{match.description}</p> : null}
                          </div>
                        );
                      })
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
