import { infringementRules, infringementRuleStats, RULE_ENGINE_VERSION } from "@/lib/infringement/rules";
import {
  builtInHighRiskReferenceItems,
  matchReferenceItems,
} from "@/lib/infringement/reference-library";
import type {
  InfringementDetectionInput,
  InfringementDetectionResult,
  InfringementRiskLevel,
  InfringementReferenceItem,
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

type EvidenceQuality = "strong" | "standard" | "weak" | "visual_only" | "none";

const WEAK_EVIDENCE_FIELDS = new Set(["filename", "original_url", "source"]);

let lastDatabaseReferenceItems: InfringementReferenceItem[] | undefined;
let lastCombinedReferenceItems: InfringementReferenceItem[] = builtInHighRiskReferenceItems;

function getReferenceItems(databaseReferenceItems: InfringementReferenceItem[] | undefined) {
  if (!databaseReferenceItems?.length) {
    lastDatabaseReferenceItems = undefined;
    lastCombinedReferenceItems = builtInHighRiskReferenceItems;
    return builtInHighRiskReferenceItems;
  }

  if (lastDatabaseReferenceItems === databaseReferenceItems) {
    return lastCombinedReferenceItems;
  }

  lastDatabaseReferenceItems = databaseReferenceItems;
  lastCombinedReferenceItems = [
    ...builtInHighRiskReferenceItems,
    ...databaseReferenceItems,
  ];

  return lastCombinedReferenceItems;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // \u53bb\u91cd\u97f3\uff1aPok\u00e9mon \u2192 pokemon, Beyonc\u00e9 \u2192 beyonce
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
    { name: "image_text_ocr", value: input.ocrText ?? "" },
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

function getRecommendation(
  riskLevel: InfringementRiskLevel,
  matchCount: number,
  visualReviewRequired: boolean,
  evidenceQuality: EvidenceQuality,
) {
  if (visualReviewRequired) {
    return "该素材缺少可用文字上下文，规则库暂时无法判断图片内部是否包含名人肖像、球队、Logo、队服文字或不雅手势。本次仅标记为待人工看图复核，不代表已经命中侵权风险。";
  }

  if (evidenceQuality === "weak") {
    return "仅在文件名、来源链接或分类等弱证据字段中发现风险词，不能直接判定图片内容侵权。建议人工看图并核对来源；如图片本身没有对应人物、角色、球队、品牌 Logo 或受保护文字，可手动标记为可用。";
  }

  if (evidenceQuality === "standard") {
    return "检测到部分上下文字段命中风险词，但证据强度低于 OCR、标题或图片哈希命中。建议结合图片内容和来源人工复核。";
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

function getFieldWeight(field: string) {
  if (field === "image_hash") return 1.18;
  if (field === "image_text_ocr") return 1;
  if (/^product_\d+_(title|description|tags|bullet_points)$/.test(field)) return 1;
  if (/^product_\d+_sku$/.test(field)) return 0.55;
  if (/^product_\d+_product_type$/.test(field)) return 0.45;
  if (field === "filename") return 0.62;
  if (field === "original_url") return 0.45;
  if (field === "source") return 0.25;
  if (field === "image_visual_content") return 0.72;
  return 0.75;
}

function isStrongEvidenceField(field: string) {
  return (
    field === "image_hash" ||
    field === "image_text_ocr" ||
    /^product_\d+_(title|description|tags|bullet_points)$/.test(field)
  );
}

function scoreMatch(match: InfringementRuleMatch) {
  if (match.rule_id === "visual-review-required") {
    return 18;
  }

  const weighted = severityScore[match.severity] * getFieldWeight(match.field);
  const imageHashBonus = match.field === "image_hash" ? 8 : 0;
  return Math.min(100, Math.round(weighted + imageHashBonus));
}

function getEvidenceQuality(matches: InfringementRuleMatch[]): EvidenceQuality {
  const nonVisualMatches = matches.filter((match) => match.rule_id !== "visual-review-required");
  if (nonVisualMatches.length === 0) {
    return matches.some((match) => match.rule_id === "visual-review-required") ? "visual_only" : "none";
  }

  if (nonVisualMatches.some((match) => isStrongEvidenceField(match.field))) return "strong";
  if (nonVisualMatches.every((match) => WEAK_EVIDENCE_FIELDS.has(match.field))) return "weak";
  return "standard";
}

function applyEvidenceQualityCap(score: number, matches: InfringementRuleMatch[], evidenceQuality: EvidenceQuality) {
  if (evidenceQuality === "visual_only") return Math.min(score, 18);
  if (evidenceQuality !== "weak") return score;

  const highestSeverity = matches.reduce<InfringementRiskLevel>((current, match) => {
    if (match.severity === "critical") return "critical";
    if (match.severity === "high" && current !== "critical") return "high";
    if (match.severity === "medium" && current !== "critical" && current !== "high") return "medium";
    if (match.severity === "low" && current === "unknown") return "low";
    return current;
  }, "unknown");

  if (highestSeverity === "critical") return Math.min(score, 68);
  if (highestSeverity === "high") return Math.min(score, 58);
  if (highestSeverity === "medium") return Math.min(score, 42);
  return Math.min(score, 28);
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

  // OCR can catch slogans, but ordinary image text does not clear visual IP risk.
  // A design can contain protected characters/logos even when OCR reads harmless words.
  return isLowInformationFilename(input.asset.filename);
}

function createVisualReviewMatch(): InfringementRuleMatch {
  return {
    category: "visual_review",
    description: "没有 OCR、图片哈希或商品上下文命中时，纯图片素材需要人工看图确认，但这不等同于已经命中侵权风险。",
    field: "image_visual_content",
    label: "待人工视觉复核",
    matched: "missing visual text evidence",
    rule_id: "visual-review-required",
    severity: "low",
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
  const referenceItems = getReferenceItems(input.referenceItems);
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
  const evidenceQuality = getEvidenceQuality(matches);
  const scoreBreakdown = matches.map((match) => ({
    field: match.field,
    matched: match.matched,
    rule_id: match.rule_id,
    score: scoreMatch(match),
    severity: match.severity,
  }));
  const highestScore = scoreBreakdown.reduce((score, match) => Math.max(score, match.score), 0);
  const uniqueRuleCount = new Set(matches.map((match) => match.rule_id)).size;
  const densityBonus = evidenceQuality === "strong" ? 4 : evidenceQuality === "standard" ? 3 : 2;
  const rawScoreWithDensity = allowlistMatched
    ? 0
    : Math.min(100, highestScore + Math.max(0, uniqueRuleCount - 1) * densityBonus);
  const scoreWithDensity = allowlistMatched ? 0 : applyEvidenceQualityCap(rawScoreWithDensity, matches, evidenceQuality);
  const riskLevel = allowlistMatched ? "unknown" : riskLevelFromScore(scoreWithDensity);
  const status = allowlistMatched ? "clear" : statusFromRiskLevel(riskLevel);
  const strongMatchCount = matches.filter((match) => isStrongEvidenceField(match.field)).length;
  const weakMatchCount = matches.filter((match) => WEAK_EVIDENCE_FIELDS.has(match.field)).length;

  return {
    confidence: scoreWithDensity,
    evidence: {
      allowlist_matched: allowlistMatched,
      allowlist_matches: allowlistMatches,
      evidence_quality: evidenceQuality,
      fields_scanned: fields.map((field) => field.name),
      high_risk_reference_count: builtInHighRiskReferenceItems.length,
      high_risk_reference_matches: highRiskReferenceMatches,
      ocr_chars: input.ocrText?.trim().length ?? 0,
      product_text_count: input.productTexts?.length ?? 0,
      reference_library_count: referenceItems.length,
      rule_count: infringementRuleStats.totalRules,
      rule_engine_version: RULE_ENGINE_VERSION,
      rule_term_count: infringementRuleStats.totalTerms,
      score_breakdown: scoreBreakdown,
      strong_match_count: strongMatchCount,
      visual_review_reason: visualReviewRequired
        ? "No reliable rights context is available for this image asset. OCR text alone does not clear protected character or logo risk."
        : undefined,
      visual_review_required: visualReviewRequired,
      weak_match_count: weakMatchCount,
    },
    matched_rules: matches,
    recommendation: allowlistMatched
      ? "白名单参考库命中，且未发现其它高风险规则命中。可作为低风险素材继续使用，但仍建议保留授权或来源记录。"
      : getRecommendation(riskLevel, matches.length, visualReviewRequired, evidenceQuality),
    risk_level: riskLevel,
    status,
  };
}

export function mapDetectionStatusToAssetCopyrightStatus(
  status: InfringementDetectionResult["status"],
  currentCopyrightStatus?: string | null,
) {
  if (status === "blocked") return "forbidden";
  if (status === "risky") return "risky";

  // 自动检测的 review 只是“待人工确认”，不要把不确定项直接写成“有风险”。
  // 自动规则没有命中时也不要直接标记“可商用”，避免把机器检测当作授权证明。
  return currentCopyrightStatus ?? "unknown";
}

export function mapReviewedStatusToAssetCopyrightStatus(status: InfringementDetectionResult["status"]) {
  if (status === "clear") return "commercial_ok";
  if (status === "blocked") return "forbidden";
  if (status === "risky" || status === "review") return "risky";
  return "unknown";
}
