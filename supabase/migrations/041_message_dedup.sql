-- ============================================================
-- Dedupe inbound WhatsApp messages against webhook retries.
--
-- Meta redelivers a webhook event when our ack is slow or dropped.
-- `messages.message_id` was deliberately left non-unique globally
-- (migration 009 — Meta IDs collide across phone numbers), but within
-- a single conversation a given Meta message id should only ever
-- appear once. Without this, a retried delivery double-inserts the
-- message and double-fires automations/flows/AI-reply/notifications
-- for the same customer text.
--
-- Partial (not full-table) unique index: message_id is NULL for
-- outbound/system rows created outside the webhook path, and NULLs
-- are naturally excluded from a unique index, but the WHERE clause
-- makes that explicit and keeps the index small.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_message_id_dedup
  ON messages (conversation_id, message_id)
  WHERE message_id IS NOT NULL;
