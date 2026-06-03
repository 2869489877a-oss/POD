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
  | "marketplace";

export type InfringementRule = {
  category: InfringementRuleCategory;
  descriptionEn: string;
  descriptionZh: string;
  id: string;
  labelEn: string;
  labelZh: string;
  patterns?: string[];
  severity: InfringementSeverity;
  terms: string[];
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
    rule_engine_version: string;
  };
  matched_rules: InfringementRuleMatch[];
  recommendation: string;
  risk_level: InfringementRiskLevel;
  status: InfringementCheckStatus;
};
