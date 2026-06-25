create index if not exists assets_created_at_idx
on public.assets(created_at desc);

create or replace view public.infringement_dashboard_items as
select
  assets.id as asset_id,
  assets.original_url as asset_original_url,
  assets.processed_url as asset_processed_url,
  assets.print_extract_url as asset_print_extract_url,
  assets.cutout_url as asset_cutout_url,
  assets.preferred_design_url as asset_preferred_design_url,
  assets.filename as asset_filename,
  assets.width as asset_width,
  assets.height as asset_height,
  assets.format as asset_format,
  assets.source as asset_source,
  assets.copyright_status as asset_copyright_status,
  assets.created_at as asset_created_at,
  latest_check.id as check_id,
  latest_check.status as check_status,
  latest_check.risk_level as check_risk_level,
  latest_check.confidence as check_confidence,
  latest_check.detection_source as check_detection_source,
  latest_check.matched_rules as check_matched_rules,
  latest_check.evidence as check_evidence,
  latest_check.recommendation as check_recommendation,
  latest_check.reviewer_note as check_reviewer_note,
  latest_check.reviewed_at as check_reviewed_at,
  latest_check.created_at as check_created_at,
  latest_check.updated_at as check_updated_at,
  coalesce(latest_check.status, 'unchecked') as latest_status,
  concat_ws(
    ' ',
    assets.filename,
    assets.original_url,
    assets.processed_url,
    assets.print_extract_url,
    assets.cutout_url,
    assets.preferred_design_url,
    assets.source,
    assets.copyright_status,
    latest_check.status,
    latest_check.risk_level,
    latest_check.detection_source,
    latest_check.recommendation,
    latest_check.reviewer_note,
    latest_check.matched_rules::text
  ) as search_text
from public.assets
left join lateral (
  select
    checks.id,
    checks.asset_id,
    checks.status,
    checks.risk_level,
    checks.confidence,
    checks.detection_source,
    checks.matched_rules,
    checks.evidence,
    checks.recommendation,
    checks.reviewer_note,
    checks.reviewed_at,
    checks.created_at,
    checks.updated_at
  from public.infringement_checks checks
  where checks.asset_id = assets.id
  order by checks.created_at desc
  limit 1
) latest_check on true;
