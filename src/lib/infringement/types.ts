export type InfringementSeverity = "low" | "medium" | "high" | "critical";

export type InfringementRiskLevel = "unknown" | "low" | "medium" | "high" | "critical";

export type InfringementCheckStatus = "pending" | "clear" | "review" | "risky" | "blocked";

export type InfringementReferenceLibraryType = "high_risk" | "allowlist";

export type InfringementRuleCategory =
  | "brand"
  | "character"
  | "celebrity"
  | "sports"
  | "copyright_phrase"
  | "logo"
  | "marketplace"
  | "visual_review";

export type InfringementRule = {
  category: InfringementRuleCategory;
  descriptionEn: string;
  descriptionZh: string;
  id: string;
  labelEn: string;
  labelZh: string;
  patterns?: string[];
  policyBasisEn?: string;
  policyBasisZh?: string;
  severity: InfringementSeverity;
  sourceLabel?: string;
  sourceUrl?: string;
  terms: string[];
};

export type InfringementRuleEntry = {
  category: InfringementRuleCategory;
  descriptionEn: string;
  descriptionZh: string;
  id: string;
  labelEn: string;
  labelZh: string;
  policyBasisEn?: string;
  policyBasisZh?: string;
  ruleId: string;
  severity: InfringementSeverity;
  sourceLabel?: string;
  sourceUrl?: string;
  term: string;
};

export type InfringementRuleMatch = {
  category: InfringementRuleCategory;
  description: string;
  field: string;
  label: string;
  matched: string;
  rule_id: string;
  severity: InfringementSeverity;
};

export type InfringementReferenceItem = {
  category: InfringementRuleCategory;
  description?: string | null;
  id: string;
  imageHash?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  libraryType: InfringementReferenceLibraryType;
  notes?: string | null;
  riskLevel: InfringementRiskLevel;
  severity: InfringementSeverity;
  source: "built_in" | "database";
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  terms: string[];
  title: string;
};

export type InfringementReferenceMatch = {
  category: InfringementRuleCategory;
  field: string;
  id: string;
  libraryType: InfringementReferenceLibraryType;
  matched: string;
  matchType: "text" | "image_hash";
  severity: InfringementSeverity;
  title: string;
};

export type InfringementDetectionInput = {
  asset: {
    copyright_status?: string;
    filename: string;
    id: string;
    image_hash?: string | null;
    original_url?: string | null;
    source?: string | null;
  };
  productTexts?: Array<{
    bullet_points?: string[];
    description?: string | null;
    product_type?: string | null;
    sku?: string | null;
    tags?: string[];
    title?: string | null;
  }>;
  referenceItems?: InfringementReferenceItem[];
  ocrText?: string | null;
};

export type InfringementDetectionResult = {
  confidence: number;
  evidence: {
    fields_scanned: string[];
    allowlist_matched?: boolean;
    allowlist_matches?: InfringementReferenceMatch[];
    high_risk_reference_count?: number;
    high_risk_reference_matches?: InfringementReferenceMatch[];
    ocr_chars?: number;
    product_text_count: number;
    reference_library_count?: number;
    rule_count?: number;
    rule_engine_version: string;
    rule_term_count?: number;
    visual_review_required?: boolean;
    visual_review_reason?: string;
  };
  matched_rules: InfringementRuleMatch[];
  recommendation: string;
  risk_level: InfringementRiskLevel;
  status: InfringementCheckStatus;
};
