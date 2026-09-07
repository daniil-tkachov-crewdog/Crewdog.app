import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import logo from "@/assets/CrewDog-App-Logo.png";

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

const Chat: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
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
  const scrollRef = React.useRef<HTMLDivElement>(null);
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
    if (!text || thinking) return;
    setInput("");

    const convId = activeId;
    const isFirst = active.messages.length === 0;
    const userMsg: Message = { id: uid(), role: "user", content: text };
    // Full turn history to send to the model (prior messages + this one).
    const outgoing = [...active.messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    updateConversation(convId, (c) => ({
      ...c,
      title: isFirst ? text.slice(0, 40) : c.title,
      messages: [...c.messages, userMsg],
    }));

    if (isAuthed && user) void persistUserMessage(convId, text, isFirst);

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

  return (
    <div className="flex h-screen w-full bg-white text-gray-900">
      {/* Sidebar — only for authed users */}
      {isAuthed && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:flex">
          <div className="p-3">
            <Button
              onClick={startNewChat}
              variant="outline"
              className="w-full justify-start gap-2"
            >
              <span className="text-lg leading-none">+</span> New chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            <p className="px-2 py-1 text-xs font-medium uppercase text-gray-400">
              History
            </p>
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group mb-1 flex items-center gap-1 rounded-md pr-1 transition ${
                  c.id === activeId ? "bg-gray-200" : "hover:bg-gray-100"
                }`}
              >
                <button
                  onClick={() => selectChat(c)}
                  className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-sm ${
                    c.id === activeId ? "font-medium" : ""
                  }`}
                >
                  {c.title}
                </button>
                <button
                  aria-label="Delete chat"
                  title="Delete chat"
                  onClick={() => removeChat(c)}
                  className="shrink-0 rounded p-1 text-gray-400 opacity-0 transition hover:bg-gray-300 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-gray-100 focus:outline-none">
                {user?.email ?? "Profile"}
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
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <Link to="/chat" className="flex items-center gap-2">
            <img src={logo} alt="Crewdog" className="h-7 w-auto" />
            <span className="font-semibold">Crewdog</span>
          </Link>
          {!isAuthed && (
            <Link to="/login">
              <Button size="sm">Log in</Button>
            </Link>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 py-6">
            {active.messages.length === 0 ? (
              <div className="mt-24 text-center">
                <img
                  src={logo}
                  alt="Crewdog"
                  className="mx-auto mb-4 h-12 w-auto"
                />
                <h1 className="text-2xl font-semibold">
                  How can I help you today?
                </h1>
                {!isAuthed && (
                  <p className="mt-2 text-sm text-gray-500">
                    You can chat without an account.{" "}
                    <Link to="/login" className="underline">
                      Log in
                    </Link>{" "}
                    to save your history.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {active.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
                      Thinking…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Crewdog…"
              rows={1}
              className="max-h-40 min-h-[44px] resize-none"
            />
            <Button onClick={send} disabled={!input.trim() || thinking}>
              Send
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-gray-400">
            Crewdog can make mistakes. Check important info.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Chat;
