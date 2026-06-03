export type InfringementSeverity = "low" | "medium" | "high" | "critical";

export type InfringementRiskLevel = "unknown" | "low" | "medium" | "high" | "critical";

export type InfringementCheckStatus = "pending" | "clear" | "review" | "risky" | "blocked";

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

export type InfringementDetectionInput = {
  asset: {
    copyright_status?: string;
    filename: string;
    id: string;
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
};

export type InfringementDetectionResult = {
  confidence: number;
  evidence: {
    fields_scanned: string[];
    product_text_count: number;
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
