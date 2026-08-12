-- ============================================================
-- Add Gemini as a third BYO-key AI provider.
--
-- Both ai_configs.provider and ai_usage_log.provider were CHECK-
-- constrained to ('openai', 'anthropic') at creation (029, 033).
-- Postgres has no ALTER CHECK, so drop and recreate each constraint
-- widened to include 'gemini'. Constraint names come from Postgres's
-- default naming (<table>_<column>_check) since neither original
-- migration named them explicitly.
-- ============================================================

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini'));

ALTER TABLE ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini'));
