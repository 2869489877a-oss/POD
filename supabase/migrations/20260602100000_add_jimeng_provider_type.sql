-- 扩展 ai_providers 表的 provider_type 约束，新增 jimeng（即梦）
ALTER TABLE public.ai_providers
  DROP CONSTRAINT ai_providers_provider_type_check,
  ADD CONSTRAINT ai_providers_provider_type_check
    CHECK (provider_type in ('gemini', 'openai', 'doubao', 'tongyi', 'jimeng'));
