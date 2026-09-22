// Server-side record of every /api/chat call — see the migration that creates
// app_chat_calls for why this exists alongside the client-written usage table.
//
// Failure policy: logging must never break a chat turn. Every entry point
// swallows its own errors; callers fire and forget.

import { clientIp, truncateIp } from "./traffic.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const enabled = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
if (!enabled) {
  console.warn(
    "[chatlog] SUPABASE_SERVICE_ROLE_KEY or Supabase URL missing — chat call logging is off"
  );
}

// Fire-and-forget. `usage` carries the token counts plus `requests`, the number
// of OpenAI calls the turn actually made.
export function recordChatCall(
  req,
  { model, agent, usage, status, startedAt, error } = {}
) {
  const u = usage ?? {};
  const row = {
    user_id: req?.userId ?? null,
    ip_prefix: truncateIp(clientIp(req)),
    user_agent: String(req?.headers?.["user-agent"] ?? "").slice(0, 500) || null,
    origin: String(req?.headers?.origin ?? req?.headers?.referer ?? "").slice(0, 300) || null,
    model: model ?? null,
    agent: !!agent,
    requests: u.requests ?? 0,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    total_tokens: u.total_tokens ?? 0,
    cached_tokens: u.cached_tokens ?? 0,
    status: status ?? null,
    duration_ms: startedAt ? Date.now() - startedAt : null,
    error: error ? String(error).slice(0, 500) : null,
  };

  // One line in the Render log too: when the database write is the thing that
  // failed, this is still a trail.
  console.log(
    `[chat] user=${row.user_id ?? "-"} ip=${row.ip_prefix ?? "-"} model=${
      row.model ?? "-"
    } agent=${row.agent} requests=${row.requests} tokens=${row.total_tokens} status=${
      row.status ?? "-"
    }${row.error ? ` error=${row.error}` : ""}`
  );

  if (!enabled) return;

  fetch(`${SUPABASE_URL}/rest/v1/app_chat_calls`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error(`[chatlog] HTTP ${res.status}: ${await res.text()}`);
      }
    })
    .catch((err) => console.error("[chatlog]", err?.message || err));
}
