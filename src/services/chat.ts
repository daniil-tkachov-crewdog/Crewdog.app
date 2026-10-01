// src/services/chat.ts
// Persistence for chat history (app_chats / app_chat_messages).
// All queries rely on RLS (auth.uid() = user_id) — a user only ever sees their own rows.
import { supabase } from "@/lib/supabase";
import type { ResultGroup } from "@/types/chatResults";

export type ChatRole = "user" | "assistant" | "system";

export type ChatRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: string;
  // Workflow results shown as cards; null when the reply ran no workflow.
  results?: ResultGroup[] | null;
  created_at: string;
};

// Until the `results` migration is applied the column is unknown to PostgREST.
// Chat must keep working through that window, just without stored cards.
const isMissingColumn = (error: { code?: string } | null) =>
  error?.code === "42703" || error?.code === "PGRST204";

// Most-recent first, for the sidebar list.
export async function listChats(): Promise<ChatRow[]> {
  const { data, error } = await supabase
    .from("app_chats")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Messages for one conversation, oldest first.
export async function listMessages(chatId: string): Promise<ChatMessageRow[]> {
  const query = (columns: string) =>
    supabase
      .from("app_chat_messages")
      .select(columns)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
  let { data, error } = await query("id, chat_id, role, content, results, created_at");
  if (isMissingColumn(error)) {
    ({ data, error } = await query("id, chat_id, role, content, created_at"));
  }
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessageRow[];
}

// Creates a conversation for the current user. user_id must match auth.uid() for RLS.
export async function createChat(
  userId: string,
  title: string
): Promise<ChatRow> {
  const { data, error } = await supabase
    .from("app_chats")
    .insert({ user_id: userId, title })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function addMessage(
  userId: string,
  chatId: string,
  role: ChatRole,
  content: string,
  results?: ResultGroup[]
): Promise<ChatMessageRow> {
  const insert = (withResults: boolean) =>
    supabase
      .from("app_chat_messages")
      .insert({
        user_id: userId,
        chat_id: chatId,
        role,
        content,
        ...(withResults ? { results } : {}),
      })
      .select("id, chat_id, role, content, created_at")
      .single();
  const hasResults = !!results?.length;
  let { data, error } = await insert(hasResults);
  if (hasResults && isMissingColumn(error)) ({ data, error } = await insert(false));
  if (error) throw error;
  return data!;
}

// Deletes a conversation. Its messages are removed too via the ON DELETE CASCADE FK.
export async function deleteChat(chatId: string): Promise<void> {
  const { error } = await supabase.from("app_chats").delete().eq("id", chatId);
  if (error) throw error;
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("app_chats")
    .update({ title })
    .eq("id", chatId);
  if (error) throw error;
}
