// src/services/chat.ts
// Persistence for chat history (app_chats / app_chat_messages).
// All queries rely on RLS (auth.uid() = user_id) — a user only ever sees their own rows.
import { supabase } from "@/lib/supabase";

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
  created_at: string;
};

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
  const { data, error } = await supabase
    .from("app_chat_messages")
    .select("id, chat_id, role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
  content: string
): Promise<ChatMessageRow> {
  const { data, error } = await supabase
    .from("app_chat_messages")
    .insert({ user_id: userId, chat_id: chatId, role, content })
    .select("id, chat_id, role, content, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("app_chats")
    .update({ title })
    .eq("id", chatId);
  if (error) throw error;
}
