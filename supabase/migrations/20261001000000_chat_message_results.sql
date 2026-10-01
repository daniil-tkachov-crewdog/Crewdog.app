-- The chat page now renders workflow results (LinkedIn people, job adverts,
-- places to live) as unfolding cards beside the reply text. The cards' data is
-- stored with the assistant message, so a conversation reopened from history
-- shows the same cards instead of a bare intro sentence.
--
-- Null for user messages and for replies that ran no workflow. The existing
-- row-level policies (auth.uid() = user_id) cover the new column as-is.

alter table public.app_chat_messages
  add column if not exists results jsonb;
