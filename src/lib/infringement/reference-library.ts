import { celebrityReferenceSeeds } from "@/lib/infringement/celebrity-seeds";
import { infringementRuleEntries } from "@/lib/infringement/rules";
import type {
  InfringementReferenceItem,
  InfringementReferenceLibraryType,
  InfringementReferenceMatch,
  InfringementRiskLevel,
  InfringementRuleCategory,
  InfringementSeverity,
} from "@/lib/infringement/types";

type ReferenceRow = {
  category?: string | null;
  description?: string | null;
  id: string;
  image_hash?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  library_type?: string | null;
  notes?: string | null;
  risk_level?: string | null;
  severity?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  terms?: string[] | null;
  title?: string | null;
};

type ReferenceField = {
  name: string;
  value: string;
};

type CompiledTermMatcher = {
  normalizedTerm: string;
  regex: RegExp | null;
};

type CompiledReferenceSet = {
  imageItems: InfringementReferenceItem[];
  textEntries: Array<{
    item: InfringementReferenceItem;
    matcher: CompiledTermMatcher;
    term: string;
  }>;
};

const categoryLimits: Array<{ category: InfringementRuleCategory; limit: number }> = [
  { category: "character", limit: 320 },
  { category: "brand", limit: 280 },
  { category: "sports", limit: 220 },
  { category: "celebrity", limit: 180 },
  { category: "logo", limit: 100 },
  { category: "copyright_phrase", limit: 100 },
];

const validLibraryTypes = new Set<InfringementReferenceLibraryType>(["high_risk", "allowlist"]);
const validRiskLevels = new Set<InfringementRiskLevel>(["unknown", "low", "medium", "high", "critical"]);
const validSeverities = new Set<InfringementSeverity>(["low", "medium", "high", "critical"]);
const validCategories = new Set<InfringementRuleCategory>([
  "brand",
  "celebrity",
  "character",
  "copyright_phrase",
  "logo",
  "marketplace",
  "sports",
  "visual_review",
]);

const termMatcherCache = new Map<string, CompiledTermMatcher>();
const referenceSetCache = new WeakMap<InfringementReferenceItem[], CompiledReferenceSet>();

const celebrityApparelContexts = [
  "portrait",
  "face",
  "photo",
  "image",
  "poster",
  "sticker",
  "graphic",
  "print",
  "shirt",
  "t-shirt",
  "tee",
  "hoodie",
  "sweatshirt",
  "jersey",
  "tour shirt",
  "concert tee",
  "memorial shirt",
  "vintage tee",
  "album cover",
  "fan art",
  "merch",
  "official merch",
  "unofficial merch",
  "肖像",
  "头像",
  "照片",
  "海报",
  "贴纸",
  "印花",
  "T恤",
  "卫衣",
  "球衣",
  "巡演",
  "演唱会",
  "纪念衫",
  "周边",
  "同款",
];

const ambiguousStandaloneCelebrityTerms = new Set([
  "future",
  "kiss",
  "prince",
  "queen",
  "seal",
  "sting",
  "v",
  "rm",
  "ye",
]);

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

function getTermMatcher(term: string) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return null;

  const cached = termMatcherCache.get(normalizedTerm);
  if (cached) return cached;

  const matcher: CompiledTermMatcher = {
    normalizedTerm,
    regex: isAsciiTerm(normalizedTerm)
      ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "i")
      : null,
  };

  termMatcherCache.set(normalizedTerm, matcher);
  return matcher;
}

function matchesPreparedTerm(text: string, matcher: CompiledTermMatcher) {
  return matcher.regex ? matcher.regex.test(text) : text.includes(matcher.normalizedTerm);
}

function cleanTerms(terms: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms) {
    const normalized = normalizeText(term);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(term.trim());
  }

  return result;
}

function slugify(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shouldUseStandaloneCelebrityTerm(term: string) {
  const normalized = normalizeText(term);
  if (!normalized) return false;
  if (ambiguousStandaloneCelebrityTerms.has(normalized)) return false;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount === 1 && normalized.length <= 3) return false;

  return true;
}

function commonsMediaSearchUrl(name: string) {
  return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(name)}&title=Special:MediaSearch&type=image`;
}

function buildCelebrityReferenceItems() {
  return celebrityReferenceSeeds.map((seed, index): InfringementReferenceItem => {
    const baseTerms = cleanTerms([seed.name, ...(seed.aliases ?? [])]);
    const standaloneTerms = baseTerms.filter(shouldUseStandaloneCelebrityTerm);
    const contextualTerms = baseTerms
      .filter((term) => !shouldUseStandaloneCelebrityTerm(term))
      .flatMap((term) => celebrityApparelContexts.map((context) => `${term} ${context}`));
    const title = seed.name;

    return {
      category: "celebrity",
      description: [
        "Celebrity, band, athlete and public-figure names or likenesses are high risk for apparel prints unless rights are documented.",
        `Seed region: ${seed.region}.`,
      ].join(" "),
      id: `built-in-celebrity-${slugify(seed.name) || index}`,
      imageHash: seed.imageHash ?? null,
      imageUrl: seed.imageUrl ?? null,
      isActive: true,
      libraryType: "high_risk",
      notes: seed.imageHash ? "Contains a perceptual image hash reference for a known high-risk sample." : null,
      riskLevel: "high",
      severity: "high",
      source: "built_in",
      sourceLabel: seed.sourceUrl ? "Wikidata public-figure seed" : "Publicity-right apparel seed",
      sourceUrl: seed.sourceUrl ?? commonsMediaSearchUrl(seed.name),
      terms: cleanTerms([...standaloneTerms, ...contextualTerms]),
      title,
    };
  });
}

function buildBuiltInReferenceItems() {
  const result: InfringementReferenceItem[] = [];

  for (const { category, limit } of categoryLimits) {
    const entries = infringementRuleEntries
      .filter((entry) => entry.category === category)
      .filter((entry) => entry.severity === "critical" || entry.severity === "high" || entry.severity === "medium")
      .slice(0, limit);

    for (const entry of entries) {
      result.push({
        category: entry.category,
        description: entry.policyBasisZh ?? entry.descriptionZh,
        id: `built-in-${entry.id}`,
        imageHash: null,
        imageUrl: null,
        isActive: true,
        libraryType: "high_risk",
        notes: null,
        riskLevel: entry.severity === "critical" ? "critical" : entry.severity === "high" ? "high" : "medium",
        severity: entry.severity,
        source: "built_in",
        sourceLabel: entry.sourceLabel,
        sourceUrl: entry.sourceUrl,
        terms: [entry.term],
        title: entry.term,
      });
    }
  }

  return result;
}

export const builtInHighRiskReferenceItems = [
  ...buildBuiltInReferenceItems(),
  ...buildCelebrityReferenceItems(),
];

export const builtInReferenceStats = builtInHighRiskReferenceItems.reduce(
  (stats, item) => {
    stats.byCategory[item.category] = (stats.byCategory[item.category] ?? 0) + 1;
    stats.totalHighRisk += 1;
    stats.totalTerms += item.terms.length;
    return stats;
  },
  {
    byCategory: {} as Partial<Record<InfringementRuleCategory, number>>,
    totalHighRisk: 0,
    totalTerms: 0,
  },
);

function normalizeLibraryType(value: string | null | undefined): InfringementReferenceLibraryType {
  return validLibraryTypes.has(value as InfringementReferenceLibraryType)
    ? value as InfringementReferenceLibraryType
    : "high_risk";
}

function normalizeCategory(value: string | null | undefined): InfringementRuleCategory {
  return validCategories.has(value as InfringementRuleCategory)
    ? value as InfringementRuleCategory
    : "marketplace";
}

function normalizeRiskLevel(value: string | null | undefined): InfringementRiskLevel {
  return validRiskLevels.has(value as InfringementRiskLevel)
    ? value as InfringementRiskLevel
    : "medium";
}

function normalizeSeverity(value: string | null | undefined): InfringementSeverity {
  return validSeverities.has(value as InfringementSeverity)
    ? value as InfringementSeverity
    : "medium";
}

export function normalizeReferenceRow(row: ReferenceRow): InfringementReferenceItem {
  const terms = cleanTerms(row.terms ?? []);
  const title = row.title?.trim() || terms[0] || "Reference item";

  return {
    category: normalizeCategory(row.category),
    description: row.description ?? null,
    id: row.id,
    imageHash: row.image_hash ?? null,
    imageUrl: row.image_url ?? null,
    isActive: row.is_active ?? true,
    libraryType: normalizeLibraryType(row.library_type),
    notes: row.notes ?? null,
    riskLevel: normalizeRiskLevel(row.risk_level),
    severity: normalizeSeverity(row.severity),
    source: "database",
    sourceLabel: row.source_label ?? null,
    sourceUrl: row.source_url ?? null,
    terms: cleanTerms([title, ...terms]),
    title,
  };
}

export function hammingDistance(hashA: string, hashB: string) {
  const a = hashA.replace(/[^a-f0-9]/gi, "").toLowerCase();
  const b = hashB.replace(/[^a-f0-9]/gi, "").toLowerCase();
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const xor = parseInt(a[index], 16) ^ parseInt(b[index], 16);
    distance += xor.toString(2).replaceAll("0", "").length;
  }
  return distance;
}

function getCompiledReferenceSet(items: InfringementReferenceItem[]) {
  const cached = referenceSetCache.get(items);
  if (cached) return cached;

  const compiled: CompiledReferenceSet = {
    imageItems: [],
    textEntries: [],
  };

  for (const item of items) {
    if (item.isActive === false) continue;
    if (item.imageHash) compiled.imageItems.push(item);

    for (const term of item.terms) {
      const matcher = getTermMatcher(term);
      if (!matcher) continue;
      compiled.textEntries.push({ item, matcher, term: term.trim() });
    }
  }

  referenceSetCache.set(items, compiled);
  return compiled;
}

export function matchReferenceItems(
  items: InfringementReferenceItem[],
  fields: ReferenceField[],
  assetImageHash?: string | null,
): InfringementReferenceMatch[] {
  const matches: InfringementReferenceMatch[] = [];
  const compiled = getCompiledReferenceSet(items);
  const normalizedFields = fields
    .map((field) => ({ name: field.name, value: normalizeText(field.value) }))
    .filter((field) => field.value.length > 0);

  if (assetImageHash) {
    for (const item of compiled.imageItems) {
      if (!item.imageHash || hammingDistance(assetImageHash, item.imageHash) > 8) continue;
      matches.push({
        category: item.category,
        field: "image_hash",
        id: item.id,
        libraryType: item.libraryType,
        matched: item.imageHash,
        matchType: "image_hash",
        severity: item.severity,
        title: item.title,
      });
    }
  }

  for (const field of normalizedFields) {
    for (const entry of compiled.textEntries) {
      if (!matchesPreparedTerm(field.value, entry.matcher)) continue;
      matches.push({
        category: entry.item.category,
        field: field.name,
        id: entry.item.id,
        libraryType: entry.item.libraryType,
        matched: entry.term,
        matchType: "text",
        severity: entry.item.severity,
        title: entry.item.title,
      });
    }
  }

  return matches;
}
