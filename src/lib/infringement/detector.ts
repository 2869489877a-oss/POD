import { infringementRules, infringementRuleStats, RULE_ENGINE_VERSION } from "@/lib/infringement/rules";
import {
  builtInHighRiskReferenceItems,
  matchReferenceItems,
} from "@/lib/infringement/reference-library";
import type {
  InfringementDetectionInput,
  InfringementDetectionResult,
  InfringementRiskLevel,
  InfringementRule,
  InfringementRuleMatch,
} from "@/lib/infringement/types";

const severityScore = {
  low: 25,
  medium: 55,
  high: 80,
  critical: 98,
} as const;

const SAFE_COPYRIGHT_STATUSES = new Set(["owned", "commercial_ok"]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s_]+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiTerm(term: string) {
  return /^[a-z0-9][a-z0-9\s.'+-]*$/i.test(term);
}

function matchTerm(text: string, term: string) {
  const normalizedTerm = normalizeText(term);

  if (normalizedTerm.length === 0) {
    return false;
  }

  if (!isAsciiTerm(normalizedTerm)) {
    return text.includes(normalizedTerm);
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "i");
  return pattern.test(text);
}

function hasMeaningfulText(value?: string | null) {
  if (!value) return false;
  const normalized = value.trim();
  if (normalized.length < 3) return false;
  return /[a-zA-Z\u4e00-\u9fa5]/.test(normalized);
}

function isLowInformationFilename(filename: string) {
  const baseName = filename
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();

  if (!baseName) return true;
  if (/^\d{5,}$/.test(baseName)) return true;
  if (/^[a-f0-9-]{16,}$/.test(baseName)) return true;
  if (/^(image|photo|picture|upload|download|screenshot|img|ai-generated)(-\d+|-[a-f0-9]+)?$/.test(baseName)) {
    return true;
  }

  return !/[a-z\u4e00-\u9fa5]{3,}/i.test(baseName);
}

function hasMeaningfulProductText(productTexts: InfringementDetectionInput["productTexts"]) {
  return (productTexts ?? []).some((product) => (
    hasMeaningfulText(product.title) ||
    hasMeaningfulText(product.description) ||
    hasMeaningfulText(product.product_type) ||
    hasMeaningfulText(product.sku) ||
    (product.tags ?? []).some(hasMeaningfulText) ||
    (product.bullet_points ?? []).some(hasMeaningfulText)
  ));
}

function getFields(input: InfringementDetectionInput) {
  const fields: Array<{ name: string; value: string }> = [
    { name: "filename", value: input.asset.filename },
    { name: "original_url", value: input.asset.original_url ?? "" },
    { name: "source", value: input.asset.source ?? "" },
  ];

  for (const [index, product] of (input.productTexts ?? []).entries()) {
    fields.push(
      { name: `product_${index + 1}_title`, value: product.title ?? "" },
      { name: `product_${index + 1}_description`, value: product.description ?? "" },
      { name: `product_${index + 1}_tags`, value: (product.tags ?? []).join(" ") },
      { name: `product_${index + 1}_bullet_points`, value: (product.bullet_points ?? []).join(" ") },
      { name: `product_${index + 1}_sku`, value: product.sku ?? "" },
      { name: `product_${index + 1}_product_type`, value: product.product_type ?? "" },
    );
  }

  return fields.filter((field) => field.value.trim().length > 0);
}

function getRecommendation(riskLevel: InfringementRiskLevel, matchCount: number, visualReviewRequired: boolean) {
  if (visualReviewRequired) {
    return "该素材缺少可用文字上下文，规则库无法判断图片内部是否包含名人肖像、球队、Logo、队服文字或不雅手势。请人工看图复核后再用于商品、套图或导出。";
  }

  if (riskLevel === "critical") {
    return "检测到高危 IP / 品牌 / 角色命中，建议禁用该素材，除非能提供明确授权。";
  }

  if (riskLevel === "high") {
    return "检测到明显商标、名人或赛事风险，建议进入人工复核，未确认授权前不要生成商品或导出。";
  }

  if (riskLevel === "medium") {
    return "检测到可能的衍生作品、Logo 或商标描述，请人工核对图片内容、来源和授权记录。";
  }

  if (riskLevel === "low") {
    return "仅检测到低风险平台文案或泛化风险词，建议导出前人工确认。";
  }

  return matchCount === 0
    ? "服装印花规则库未发现明显文字命中。该结果不是法律意见，仍建议对商用素材保留授权证明。"
    : "存在规则命中，请人工复核后再决定是否上架。";
}

function statusFromRiskLevel(riskLevel: InfringementRiskLevel) {
  if (riskLevel === "critical") return "blocked" as const;
  if (riskLevel === "high") return "risky" as const;
  if (riskLevel === "medium" || riskLevel === "low") return "review" as const;
  return "clear" as const;
}

function riskLevelFromScore(score: number): InfringementRiskLevel {
  if (score >= 95) return "critical";
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  if (score > 0) return "low";
  return "unknown";
}

function findRuleMatches(rule: InfringementRule, fields: Array<{ name: string; value: string }>) {
  const matches: InfringementRuleMatch[] = [];

  for (const field of fields) {
    const normalized = normalizeText(field.value);

    for (const term of rule.terms) {
      if (!matchTerm(normalized, term)) {
        continue;
      }

      matches.push({
        category: rule.category,
        description: rule.descriptionZh,
        field: field.name,
        label: rule.labelZh,
        matched: term,
        rule_id: rule.id,
        severity: rule.severity,
      });
    }
  }

  return matches;
}

function shouldRequireVisualReview(input: InfringementDetectionInput, matches: InfringementRuleMatch[]) {
  if (matches.length > 0) return false;
  if (SAFE_COPYRIGHT_STATUSES.has(input.asset.copyright_status ?? "")) return false;
  if (hasMeaningfulProductText(input.productTexts)) return false;

  return isLowInformationFilename(input.asset.filename);
}

function createVisualReviewMatch(): InfringementRuleMatch {
  return {
    category: "visual_review",
    description: "没有 OCR 或视觉识别结果时，纯图片素材不能仅凭文件名自动判定无风险。",
    field: "image_visual_content",
    label: "需要人工看图复核",
    matched: "missing visual text evidence",
    rule_id: "visual-review-required",
    severity: "medium",
  };
}

function createReferenceRuleMatch(
  match: ReturnType<typeof matchReferenceItems>[number],
): InfringementRuleMatch {
  return {
    category: match.category,
    description: match.libraryType === "allowlist"
      ? "白名单参考库命中。"
      : "高风险图片参考库命中。",
    field: match.field,
    label: match.libraryType === "allowlist" ? `白名单：${match.title}` : `高风险参考：${match.title}`,
    matched: match.matched,
    rule_id: `reference:${match.id}`,
    severity: match.severity,
  };
}

export function runInfringementDetection(input: InfringementDetectionInput): InfringementDetectionResult {
  const fields = getFields(input);
  const textMatches = infringementRules.flatMap((rule) => findRuleMatches(rule, fields));
  const referenceItems = [
    ...builtInHighRiskReferenceItems,
    ...(input.referenceItems ?? []),
  ];
  const referenceMatches = matchReferenceItems(referenceItems, fields, input.asset.image_hash);
  const highRiskReferenceMatches = referenceMatches.filter((match) => match.libraryType === "high_risk");
  const allowlistMatches = referenceMatches.filter((match) => match.libraryType === "allowlist");
  const highRiskMatches = [
    ...textMatches,
    ...highRiskReferenceMatches.map(createReferenceRuleMatch),
  ];
  const allowlistMatched = allowlistMatches.length > 0 && highRiskMatches.length === 0;
  const visualReviewRequired = !allowlistMatched && shouldRequireVisualReview(input, highRiskMatches);
  const matches = visualReviewRequired ? [...highRiskMatches, createVisualReviewMatch()] : highRiskMatches;
  const highestScore = matches.reduce((score, match) => Math.max(score, severityScore[match.severity]), 0);
  const scoreWithDensity = allowlistMatched
    ? 0
    : Math.min(100, highestScore + Math.max(0, matches.length - 1) * 3);
  const riskLevel = allowlistMatched ? "unknown" : riskLevelFromScore(scoreWithDensity);
  const status = allowlistMatched ? "clear" : statusFromRiskLevel(riskLevel);

  return {
    confidence: scoreWithDensity,
    evidence: {
      allowlist_matched: allowlistMatched,
      allowlist_matches: allowlistMatches,
      fields_scanned: fields.map((field) => field.name),
      high_risk_reference_count: builtInHighRiskReferenceItems.length,
      high_risk_reference_matches: highRiskReferenceMatches,
      product_text_count: input.productTexts?.length ?? 0,
      reference_library_count: referenceItems.length,
      rule_count: infringementRuleStats.totalRules,
      rule_engine_version: RULE_ENGINE_VERSION,
      rule_term_count: infringementRuleStats.totalTerms,
      visual_review_reason: visualReviewRequired
        ? "No textual context or OCR/vision signal is available for this image asset."
        : undefined,
      visual_review_required: visualReviewRequired,
    },
    matched_rules: matches,
    recommendation: allowlistMatched
      ? "白名单参考库命中，且未发现其它高风险规则命中。可作为低风险素材继续使用，但仍建议保留授权或来源记录。"
      : getRecommendation(riskLevel, matches.length, visualReviewRequired),
    risk_level: riskLevel,
    status,
  };
}

export function mapDetectionStatusToAssetCopyrightStatus(
  status: InfringementDetectionResult["status"],
  currentCopyrightStatus?: string | null,
) {
  if (status === "blocked") return "forbidden";
  if (status === "risky" || status === "review") return "risky";

  // 自动规则没有命中时不要直接标记“可商用”，避免把机器检测当作授权证明。
  return currentCopyrightStatus ?? "unknown";
}

export function mapReviewedStatusToAssetCopyrightStatus(status: InfringementDetectionResult["status"]) {
  if (status === "clear") return "commercial_ok";
  if (status === "blocked") return "forbidden";
  if (status === "risky" || status === "review") return "risky";
  return "unknown";
}
