import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  id: string;
  title: string;
  messages: Message[];
};

const uid = () => Math.random().toString(36).slice(2);

// Demo-only canned responses. Real backend (ChatGPT API) comes later.
const DEMO_REPLIES = [
  "This is a demo response. Once the backend is wired up, I'll answer using the ChatGPT API.",
  "Good question — for now I'm running in demo mode, so my replies are placeholders.",
  "Got it. In the full version this is where Crewdog's assistant would help you out.",
];

const newConversation = (): Conversation => ({
  id: uid(),
  title: "New chat",
  messages: [],
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

  const active =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active.messages, thinking]);

  const updateActive = (updater: (c: Conversation) => Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? updater(c) : c))
    );
  };

  const send = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content: text };
    updateActive((c) => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 40) : c.title,
      messages: [...c.messages, userMsg],
    }));

    setThinking(true);
    window.setTimeout(() => {
      const reply =
        DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)];
      const botMsg: Message = { id: uid(), role: "assistant", content: reply };
      updateActive((c) => ({ ...c, messages: [...c.messages, botMsg] }));
      setThinking(false);
    }, 700);
  };

  const startNewChat = () => {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
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
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`mb-1 w-full truncate rounded-md px-2 py-2 text-left text-sm transition ${
                  c.id === activeId
                    ? "bg-gray-200 font-medium"
                    : "hover:bg-gray-100"
                }`}
              >
                {c.title}
              </button>
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
            Demo mode — responses are placeholders.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Chat;
