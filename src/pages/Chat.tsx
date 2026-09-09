import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Copy, Check, Paperclip, X, FileText } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import { renderRichText } from "@/components/chat/richtext";
import { extractCv, type AttachedCv } from "@/services/cv";
import {
  listChats,
  listMessages,
  createChat,
  addMessage,
  deleteChat,
} from "@/services/chat";
import { getSettings, logTokenUsage } from "@/services/settings";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: string; // local id; equals dbId once persisted
  dbId?: string; // set once the conversation exists in the DB
  title: string;
  messages: Message[];
  loaded: boolean; // whether messages have been fetched from the DB
};

const uid = () => Math.random().toString(36).slice(2);

const newConversation = (): Conversation => ({
  id: uid(),
  title: "New chat",
  messages: [],
  loaded: true, // a brand-new local chat has nothing to fetch
});

// Playful, on-brand loading lines shown while Crewdog fetches a reply.
const THINKING_PHRASES = [
  "Sniffing out the answer…",
  "On the scent…",
  "Fetching…",
  "Digging up the details…",
  "Following the trail…",
  "Chasing down the lead…",
  "Rounding up results…",
  "Nose to the ground…",
  "Good boy is thinking…",
  "Almost got it…",
];

const ThinkingIndicator: React.FC = () => {
  const [i, setI] = React.useState(
    () => Math.floor(Math.random() * THINKING_PHRASES.length)
  );
  React.useEffect(() => {
    const id = setInterval(
      () => setI((v) => (v + 1) % THINKING_PHRASES.length),
      2200
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="chat-rise-in flex items-center gap-3">
      <div className="flex items-center gap-[5px]">
        {[0, 0.18, 0.36].map((d) => (
          <span
            key={d}
            className="chat-dot h-[7px] w-[7px] rounded-full bg-[#B6B3AA] dark:bg-[#6C6963]"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
      <span
        key={i}
        className="chat-phrase text-[14px] text-[#6E6B64] dark:text-[#96938C]"
      >
        {THINKING_PHRASES[i]}
      </span>
    </div>
  );
};

const CopyButton: React.FC<{ text: string; align: "start" | "end" }> = ({
  text,
  align,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the message.");
    }
  };
  return (
    <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
      <button
        onClick={copy}
        aria-label="Copy message"
        title="Copy message"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[#6E6B64] opacity-0 transition hover:text-[#1A1917] focus:opacity-100 group-hover:opacity-100 dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
      >
        {copied ? (
          <Check className="h-[13px] w-[13px]" />
        ) : (
          <Copy className="h-[13px] w-[13px]" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

const Chat: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const isAuthed = !!user;

  const handleLogout = async () => {
    await signOut();
    navigate("/chat", { replace: true });
  };

  const [conversations, setConversations] = React.useState<Conversation[]>([
    newConversation(),
  ]);
  const [activeId, setActiveId] = React.useState(conversations[0].id);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  // Attached CV (decoded to text) that rides along with the next message.
  const [cv, setCv] = React.useState<AttachedCv | null>(null);
  const [cvModalOpen, setCvModalOpen] = React.useState(false);
  const [cvLoading, setCvLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Maps a conversation's local id -> its DB id. A ref so async callbacks
  // (e.g. the delayed assistant reply) always read the latest value.
  const dbIds = React.useRef<Record<string, string>>({});
  // In-flight createChat promises, keyed by local id, so the user message and
  // the delayed assistant reply share one insert instead of racing to create two.
  const creating = React.useRef<Record<string, Promise<string>>>({});

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active.messages, thinking]);

  // Auto-grow the composer textarea up to its max height, then scroll.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  const updateConversation = (
    id: string,
    updater: (c: Conversation) => Conversation
  ) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? updater(c) : c))
    );
  };

  // Load the user's saved conversations on login. Logged-out users stay local-only.
  React.useEffect(() => {
    dbIds.current = {};
    if (!isAuthed) {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listChats();
        if (cancelled) return;
        const loaded: Conversation[] = rows.map((r) => ({
          id: r.id,
          dbId: r.id,
          title: r.title,
          messages: [],
          loaded: false,
        }));
        rows.forEach((r) => (dbIds.current[r.id] = r.id));
        // Start on a fresh empty chat, with saved history below it in the sidebar.
        const fresh = newConversation();
        setConversations([fresh, ...loaded]);
        setActiveId(fresh.id);
      } catch (e) {
        console.error(e);
        toast.error("Couldn't load your chat history.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, user?.id]);

  // Fetch messages the first time a saved conversation is opened.
  const selectChat = async (conv: Conversation) => {
    setActiveId(conv.id);
    if (conv.loaded || !conv.dbId) return;
    try {
      const rows = await listMessages(conv.dbId);
      updateConversation(conv.id, (c) => ({
        ...c,
        loaded: true,
        messages: rows.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }));
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load this conversation.");
    }
  };

  const send = async () => {
    const text = input.trim();
    const attached = cv;
    if ((!text && !attached) || thinking) return;
    setInput("");
    setCv(null);

    const convId = activeId;
    const isFirst = active.messages.length === 0;
    // What we show/store: the typed text plus a light attachment tag.
    const displayContent = attached
      ? `${text}${text ? "\n\n" : ""}📎 ${attached.name}`
      : text;
    // What the model receives: the typed text plus the full CV text.
    const apiContent = attached
      ? `${text}${text ? "\n\n" : ""}Text of the CV (${attached.name}):\n${attached.text}`
      : text;

    const userMsg: Message = { id: uid(), role: "user", content: displayContent };
    // Full turn history to send to the model (prior messages + this one).
    const outgoing = [
      ...active.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: apiContent },
    ];

    const titleSource = text || attached?.name || "New chat";
    updateConversation(convId, (c) => ({
      ...c,
      title: isFirst ? titleSource.slice(0, 40) : c.title,
      messages: [...c.messages, userMsg],
    }));

    if (isAuthed && user)
      void persistUserMessage(convId, displayContent, isFirst);

    setThinking(true);
    try {
      const settings = await getSettings();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outgoing,
          model: settings.chat_model,
          webSearch: settings.web_search,
          fileSearch: settings.file_search,
          systemPrompt: settings.system_prompt,
          userPromptAddition: settings.user_prompt_addition,
          agent: {
            enabled: settings.agent_enabled,
            config: settings.agent_config ?? {},
          },
        }),
      });
      if (!res.ok) throw new Error(`chat failed: ${res.status}`);
      const data = await res.json();
      const reply = String(data?.reply ?? "").trim() || "(no response)";
      if (isAuthed && user && data?.usage) {
        void logTokenUsage(user.id, data?.model ?? settings.chat_model, data.usage);
      }
      const botMsg: Message = { id: uid(), role: "assistant", content: reply };
      updateConversation(convId, (c) => ({
        ...c,
        messages: [...c.messages, botMsg],
      }));
      if (isAuthed && user) void persistAssistantMessage(convId, reply);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't reach the assistant. Try again.");
    } finally {
      setThinking(false);
    }
  };

  // Resolves the conversation's DB id, creating the row once if needed.
  const ensureChat = (convId: string, title: string): Promise<string> => {
    const existing = dbIds.current[convId];
    if (existing) return Promise.resolve(existing);
    if (!creating.current[convId]) {
      creating.current[convId] = createChat(user!.id, title).then((row) => {
        dbIds.current[convId] = row.id;
        updateConversation(convId, (c) => ({ ...c, dbId: row.id }));
        return row.id;
      });
    }
    return creating.current[convId];
  };

  const persistUserMessage = async (
    convId: string,
    text: string,
    isFirst: boolean
  ) => {
    if (!user) return;
    try {
      const dbId = await ensureChat(convId, isFirst ? text.slice(0, 40) : "New chat");
      await addMessage(user.id, dbId, "user", text);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save your message.");
    }
  };

  const persistAssistantMessage = async (convId: string, text: string) => {
    if (!user) return;
    try {
      const dbId = await ensureChat(convId, "New chat");
      await addMessage(user.id, dbId, "assistant", text);
    } catch (e) {
      console.error(e);
    }
  };

  const startNewChat = () => {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
  };

  const removeChat = async (conv: Conversation) => {
    const dbId = conv.dbId ?? dbIds.current[conv.id];
    // Optimistically drop it from the sidebar; keep at least one chat around.
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== conv.id);
      const list = next.length ? next : [newConversation()];
      if (activeId === conv.id) setActiveId(list[0].id);
      return list;
    });
    delete dbIds.current[conv.id];
    delete creating.current[conv.id];
    if (!dbId) return; // never persisted, nothing to delete
    try {
      await deleteChat(dbId);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't delete this chat.");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleCvFile = async (file?: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Only PDF files are supported.");
      return;
    }
    setCvLoading(true);
    try {
      const parsed = await extractCv(file);
      setCv(parsed);
      setCvModalOpen(false);
      toast.success(`Attached ${parsed.name}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't read the PDF.");
    } finally {
      setCvLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSend = (!!input.trim() || !!cv) && !thinking;

  return (
    <div className="flex h-screen w-full bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      {/* Sidebar — only for authed users */}
      {isAuthed && (
        <aside className="hidden w-[258px] shrink-0 flex-col bg-[#F7F7F5] dark:bg-[#111014] md:flex">
          <div className="flex flex-col gap-4 px-4 pb-[14px] pt-[18px]">
            <Link to="/chat" className="px-[6px]">
              <Wordmark />
            </Link>
            <button
              onClick={startNewChat}
              className="flex items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] text-[14px] font-medium transition-[background] duration-150 hover:bg-[rgba(26,25,23,0.06)] dark:hover:bg-[rgba(255,255,255,0.07)]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1A1917] text-[14px] leading-none text-white dark:bg-[#ECEBE8] dark:text-[#17161A]">
                +
              </span>
              New chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-[10px]">
            <p className="mx-[10px] mb-[6px] text-[11.5px] font-medium tracking-[0.04em] text-[#6E6B64] dark:text-[#96938C]">
              History
            </p>
            {conversations.map((c) => {
              const activeRow = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-[6px] rounded-[9px] transition-[background] duration-150 ${
                    activeRow
                      ? "bg-[rgba(26,25,23,0.07)] dark:bg-[rgba(255,255,255,0.09)]"
                      : "hover:bg-[rgba(26,25,23,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                  }`}
                >
                  <button
                    onClick={() => selectChat(c)}
                    className={`min-w-0 flex-1 truncate px-[10px] py-[9px] text-left text-[13.5px] ${
                      activeRow
                        ? "font-medium text-[#1A1917] dark:text-[#ECEBE8]"
                        : "text-[#5F5D57] dark:text-[#A6A39C]"
                    }`}
                  >
                    {c.title}
                  </button>
                  <button
                    aria-label="Delete chat"
                    title="Delete chat"
                    onClick={() => removeChat(c)}
                    className="mr-[6px] shrink-0 text-[13px] leading-none text-[#6E6B64] opacity-0 transition hover:text-[#E0480F] focus:opacity-100 group-hover:opacity-100 dark:text-[#A6A39C] dark:hover:text-[#FF5A1F]"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className="p-[10px]">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-[10px] rounded-[10px] px-[10px] py-[9px] text-left transition-[background] duration-150 hover:bg-[rgba(26,25,23,0.06)] focus:outline-none dark:hover:bg-[rgba(255,255,255,0.07)]">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#E0480F] text-[11px] font-bold text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F]">
                  {(user?.email ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#5F5D57] dark:text-[#A6A39C]">
                  {user?.email ?? "Profile"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/pricing">Your Plan</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account">Account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  }}
                >
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Help</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem asChild>
                      <Link to="/faq">FAQ</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/support">Support</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/privacy">Privacy Policy</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/terms">Terms of Use</Link>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="text-red-600 focus:text-red-600"
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-6">
          <span className="truncate text-[14px] font-medium">
            {active.messages.length === 0 ? "New chat" : active.title}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!isAuthed && (
              <Link
                to="/login"
                className="rounded-[9px] bg-[#E0480F] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 dark:bg-[#FF5A1F] dark:text-[#0B0B0F]"
              >
                Log in
              </Link>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-6 pb-6 pt-[10px]">
            {active.messages.length === 0 ? (
              <div className="mt-24 flex flex-col items-center text-center">
                <Wordmark className="mb-6" />
                <h1 className="text-[32px] font-semibold tracking-[-0.03em]">
                  How can I help you today?
                </h1>
                {!isAuthed && (
                  <p className="mt-3 text-[14.5px] leading-[1.6] text-[#6E6B64] dark:text-[#96938C]">
                    You can chat without an account.{" "}
                    <Link to="/login" className="underline">
                      Log in
                    </Link>{" "}
                    to save your history.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {active.messages.map((m, i) => (
                  <div
                    key={m.id}
                    className="chat-rise-in group flex flex-col gap-1"
                    style={{ animationDelay: `${Math.min(i * 80, 400)}ms` }}
                  >
                    <div
                      className={`flex ${
                        m.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {m.role === "user" ? (
                        <div className="max-w-[76%] whitespace-pre-wrap rounded-[18px] bg-[#F1F0EC] px-[18px] py-[13px] text-[15px] leading-[1.6] text-[#1A1917] dark:bg-[#26252B] dark:text-[#F3F2EF]">
                          {renderRichText(m.content)}
                        </div>
                      ) : (
                        <div className="w-full whitespace-pre-wrap text-[16px] leading-[1.75] text-[#25231F] [text-wrap:pretty] dark:text-[#DEDCD7]">
                          {renderRichText(m.content)}
                        </div>
                      )}
                    </div>
                    <CopyButton
                      text={m.content}
                      align={m.role === "user" ? "end" : "start"}
                    />
                  </div>
                ))}
                {thinking && <ThinkingIndicator />}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-5">
          {cv && (
            <div className="mx-auto mb-2 flex w-full max-w-[720px]">
              <span className="inline-flex items-center gap-2 rounded-[10px] border border-[rgba(26,25,23,0.14)] bg-[#F7F7F5] py-1.5 pl-3 pr-2 text-[13px] text-[#1A1917] dark:border-[rgba(255,255,255,0.12)] dark:bg-[#141317] dark:text-[#ECEBE8]">
                <FileText className="h-[14px] w-[14px] text-[#E0480F] dark:text-[#FF5A1F]" />
                <span className="max-w-[220px] truncate">{cv.name}</span>
                <button
                  onClick={() => setCv(null)}
                  aria-label="Remove attachment"
                  className="text-[#6E6B64] transition-colors hover:text-[#E0480F] dark:text-[#96938C] dark:hover:text-[#FF5A1F]"
                >
                  <X className="h-[14px] w-[14px]" />
                </button>
              </span>
            </div>
          )}
          <div className="group mx-auto flex w-full max-w-[720px] items-end gap-[8px] rounded-[24px] border border-[rgba(26,25,23,0.14)] bg-white py-[10px] pl-[10px] pr-[10px] shadow-[0_6px_20px_-12px_rgba(26,24,20,0.2)] transition-[border-color,box-shadow] duration-200 focus-within:border-[rgba(26,25,23,0.26)] focus-within:shadow-[0_10px_26px_-14px_rgba(26,24,20,0.28)] hover:border-[rgba(26,25,23,0.26)] dark:border-[rgba(255,255,255,0.12)] dark:bg-[#1F1E24] dark:shadow-none dark:focus-within:border-[rgba(255,255,255,0.24)] dark:focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.04)] dark:hover:border-[rgba(255,255,255,0.24)]">
            <button
              onClick={() => setCvModalOpen(true)}
              disabled={thinking}
              aria-label="Attach your CV (PDF)"
              title="Attach your CV (PDF)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6E6B64] transition-[background,color] duration-150 hover:bg-[rgba(26,25,23,0.06)] hover:text-[#1A1917] disabled:pointer-events-none disabled:opacity-40 dark:text-[#96938C] dark:hover:bg-[rgba(255,255,255,0.07)] dark:hover:text-[#ECEBE8]"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Crewdog…"
              rows={1}
              className="max-h-[150px] min-h-[30px] flex-1 resize-none bg-transparent py-[5px] text-[15px] leading-[1.55] text-[#1A1917] outline-none placeholder:text-[#6E6B64] dark:text-[#ECEBE8] dark:placeholder:text-[#96938C]"
            />
            <button
              onClick={send}
              disabled={!canSend}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A1917] text-[15px] text-white transition-[transform,background] duration-200 hover:-translate-y-[2px] hover:bg-[#E0480F] disabled:pointer-events-none disabled:opacity-40 dark:bg-[#ECEBE8] dark:text-[#17161A] dark:hover:bg-[#FF5A1F] dark:hover:text-white"
            >
              ↑
            </button>
          </div>
          <p className="mx-auto mt-[10px] max-w-[720px] text-center text-[11.5px] text-[#6E6B64] dark:text-[#96938C]">
            Crewdog can make mistakes. Check important info.
          </p>
        </div>

        {/* Hidden file input, opened by the modal's "Choose file" button. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleCvFile(e.target.files?.[0])}
        />

        {cvModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Upload your CV"
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => !cvLoading && setCvModalOpen(false)}
            />
            <div className="relative w-full max-w-[400px] rounded-[16px] border border-[rgba(26,25,23,0.1)] bg-white p-7 text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.4)] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#1F1E24]">
              <button
                onClick={() => !cvLoading && setCvModalOpen(false)}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>

              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F7F7F5] dark:bg-[#141317]">
                <FileText className="h-6 w-6 text-[#E0480F] dark:text-[#FF5A1F]" />
              </div>
              <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
                Upload your CV
              </h2>
              <p className="mt-1 text-[13px] text-[#6E6B64] dark:text-[#96938C]">
                only PDF
              </p>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={cvLoading}
                className="mt-6 w-full rounded-[10px] bg-[#E0480F] px-[18px] py-[11px] text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FF5A1F] dark:text-[#0B0B0F]"
              >
                {cvLoading ? "Reading…" : "Choose file"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Chat;
