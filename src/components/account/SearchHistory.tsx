import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link as LinkIcon,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  fetchSearchHistory,
  setContactStatuses,
  setImportantSearch,
  type HistoryItem,
} from "@/services/history";
import type { ContactStatus } from "@/types/account";
import { PANEL, SECTION_LABEL, BTN_ACCENT } from "./ui";

const MONO = "tracking-[0.02em]";
const SUBLABEL =
  "mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6E6B64] dark:text-[#96938C]";

export default function SearchHistory() {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursors, setNextCursors] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  const [savingImportant, setSavingImportant] = useState<Record<string, boolean>>({});
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});
  const [showFullJd, setShowFullJd] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpanded((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const loadPage = async (target: number) => {
    if (loading) return;
    setLoading(true);
    try {
      const cursor = cursorStack[target - 1] ?? null;
      const data = await fetchSearchHistory({ limit: 5, cursor });
      setItems(data.items || []);
      const nc = [...nextCursors];
      nc[target - 1] = data.nextCursor ?? null;
      setNextCursors(nc);
      setPage(target);
      if (data.nextCursor && !cursorStack[target]) {
        const ns = [...cursorStack];
        ns[target] = data.nextCursor;
        setCursorStack(ns);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(1);
    const vis = () => {
      if (document.visibilityState === "visible") loadPage(1);
    };
    document.addEventListener("visibilitychange", vis);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("gc-activity");
      bc.addEventListener("message", (e) => {
        if (e?.data?.type === "search_used") loadPage(1);
      });
    } catch {}
    return () => {
      document.removeEventListener("visibilitychange", vis);
      bc?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrev = page > 1;
  const canNext = Boolean(nextCursors[page - 1] || cursorStack[page]);
  const visibleItems = importantOnly
    ? items.filter((i) => i.isImportant)
    : items;

  const toggleImportant = async (it: HistoryItem) => {
    if (!it?.id) return;
    const next = !it.isImportant;
    setItems((prev) =>
      prev.map((x) => (x.id === it.id ? { ...x, isImportant: next } : x))
    );
    setSavingImportant((p) => ({ ...p, [it.id]: true }));
    try {
      await setImportantSearch(it.id, next);
    } catch {
      setItems((prev) =>
        prev.map((x) => (x.id === it.id ? { ...x, isImportant: !next } : x))
      );
    } finally {
      setSavingImportant((p) => ({ ...p, [it.id]: false }));
    }
  };

  const setStatus = async (
    item: HistoryItem,
    kind: "hr" | "lead",
    key: string,
    status: ContactStatus
  ) => {
    const mapKey = `${kind}:${key}`;
    const current = item.contactStatuses || {};
    const next = { ...current, [mapKey]: status };
    setItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, contactStatuses: next } : x))
    );
    setSavingStatus((p) => ({ ...p, [item.id]: true }));
    try {
      await setContactStatuses(item.id, next);
    } catch {
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, contactStatuses: current } : x
        )
      );
    } finally {
      setSavingStatus((p) => ({ ...p, [item.id]: false }));
    }
  };

  const jdPreview = (it: HistoryItem) => {
    const base = (it.jdRaw || it.jdExcerpt || "").trim();
    if (!base) return it.sourceUrl || "No excerpt available.";
    if (showFullJd[it.id] || base.length <= 220) return base;
    return `${base.slice(0, 220)}...`;
  };

  const pagerBtn =
    "inline-flex items-center gap-1 rounded-[2px] border border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] px-3 py-[7px] " +
    MONO +
    " text-[11px] uppercase text-[#6E6B64] dark:text-[#96938C] transition-colors hover:border-[#E0480F] dark:hover:border-[#FF5A1F] disabled:cursor-not-allowed disabled:opacity-40";

  const statusSelect =
    "rounded-[2px] border border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] bg-white dark:bg-[#1F1E24] px-2 py-1 " +
    MONO +
    " text-[11px] text-[#1A1917] dark:text-[#ECEBE8] focus:outline-none focus:border-[#E0480F] dark:focus:border-[#FF5A1F]";

  function ContactList({
    item,
    kind,
    rows,
    emptyLabel,
  }: {
    item: HistoryItem;
    kind: "hr" | "lead";
    rows: { name?: string; title?: string; profileUrl?: string }[] | undefined;
    emptyLabel: string;
  }) {
    if (!rows?.length) return <p className="text-[14px] text-[#5F5D57] dark:text-[#A6A39C]">{emptyLabel}</p>;
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((c, i) => {
          const key = c.profileUrl || c.name || `${kind}-${i}`;
          const st = (item.contactStatuses?.[`${kind}:${key}`] ||
            "none") as ContactStatus;
          return (
            <div
              key={`${item.id}-${kind}-${i}`}
              className="flex items-start justify-between gap-3 rounded-[4px] border border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] bg-white dark:bg-[#1F1E24] p-3"
            >
              <div className="min-w-0">
                {c?.profileUrl ? (
                  <a
                    href={c.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[14px] font-medium text-[#E0480F] dark:text-[#FF5A1F] hover:underline"
                  >
                    {c?.name || c.profileUrl}
                  </a>
                ) : (
                  <p className="truncate text-[14px] font-medium">
                    {c?.name || (kind === "hr" ? "Unnamed contact" : "Unnamed lead")}
                  </p>
                )}
                <p className="truncate text-[12px] text-[#6E6B64] dark:text-[#96938C]">
                  {c?.title || (kind === "hr" ? item.companyName || "—" : "linkedin.com")}
                </p>
              </div>
              <select
                value={st}
                disabled={savingStatus[item.id]}
                onChange={(e) =>
                  void setStatus(item, kind, key, e.target.value as ContactStatus)
                }
                className={statusSelect}
              >
                <option value="none">None</option>
                <option value="requested">Requested</option>
                <option value="accepted">Accepted</option>
                <option value="messaged">Messaged</option>
              </select>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className={SECTION_LABEL}>Search history</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportantOnly((v) => !v)}
            className={
              "inline-flex items-center gap-1 rounded-[2px] border px-3 py-[7px] " +
              MONO +
              " text-[11px] uppercase transition-colors " +
              (importantOnly
                ? "border-[#E0480F] dark:border-[#FF5A1F] bg-[#E0480F] dark:bg-[#FF5A1F] text-[#1A1917] dark:text-[#ECEBE8]"
                : "border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] text-[#6E6B64] dark:text-[#96938C] hover:border-[#E0480F] dark:hover:border-[#FF5A1F]")
            }
          >
            <Star className="h-3.5 w-3.5" />
            {importantOnly ? "Important only" : "All results"}
          </button>
          <button
            onClick={() => canPrev && loadPage(page - 1)}
            disabled={!canPrev || loading}
            className={pagerBtn}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            onClick={() => canNext && loadPage(page + 1)}
            disabled={!canNext || loading}
            className={pagerBtn}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] bg-white dark:bg-[#1F1E24] px-9 py-12 text-center">
          <h3 className="mb-2 text-[18px] tracking-[-0.01em]">No searches yet</h3>
          <p className="mb-6 text-[14px] text-[#5F5D57] dark:text-[#A6A39C]">
            {importantOnly
              ? "No starred searches yet."
              : "Start your first search to see it here."}
          </p>
          <Link
            to="/run"
            className={`inline-block ${BTN_ACCENT}`}
          >
            Run your first search
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((it) => {
            const created = it.createdAt
              ? new Date(it.createdAt).toLocaleString()
              : "";
            const isOpen = expanded.includes(it.id);
            return (
              <div
                key={it.id}
                className="overflow-hidden rounded-md border border-[rgba(26,25,23,0.1)] dark:border-[rgba(255,255,255,0.1)] bg-white dark:bg-[#1F1E24]"
              >
                <button
                  onClick={() => toggle(it.id)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#E0480F] text-[16px] font-bold text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F]">
                      {(it.companyName?.[0] || it.jobTitle?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">
                        {it.jobTitle || "Untitled role"}
                        {it.companyName ? ` — ${it.companyName}` : ""}
                      </p>
                      <span className={MONO + " text-[11px] text-[#6E6B64] dark:text-[#96938C]"}>
                        {created}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Mark important"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!savingImportant[it.id]) void toggleImportant(it);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!savingImportant[it.id]) void toggleImportant(it);
                        }
                      }}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          it.isImportant
                            ? "fill-[#E0480F] dark:fill-[#FF5A1F] text-[#E0480F] dark:text-[#FF5A1F]"
                            : "text-[#6E6B64] dark:text-[#96938C]"
                        }`}
                      />
                    </span>
                    <span className={MONO + " text-[11px] uppercase text-[#E0480F] dark:text-[#FF5A1F]"}>
                      Completed
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.25 }}
                      className="text-[#6E6B64] dark:text-[#96938C]"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </motion.span>
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-6 pb-6"
                    >
                      <div className="mb-4 h-px bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.1)]" />

                      <div className={PANEL}>
                        <p className={SUBLABEL}>Advert (excerpt)</p>
                        <p className="whitespace-pre-wrap text-[14px] text-[#1A1917] dark:text-[#ECEBE8]">
                          {jdPreview(it)}
                        </p>
                        {((it.jdRaw || it.jdExcerpt || "").trim().length > 220 ||
                          Boolean(it.sourceUrl)) && (
                          <button
                            className="mt-2 text-[11px] text-[#E0480F] hover:underline dark:text-[#FF5A1F]"
                            onClick={() =>
                              setShowFullJd((p) => ({ ...p, [it.id]: !p[it.id] }))
                            }
                            type="button"
                          >
                            {showFullJd[it.id] ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3">
                        <div className={PANEL}>
                          <p className={SUBLABEL}>Company website</p>
                          {it.companyUrl ? (
                            <a
                              href={it.companyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 break-all text-[14px] text-[#E0480F] dark:text-[#FF5A1F] hover:underline"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              {it.companyUrl}
                            </a>
                          ) : (
                            <p className="text-[14px]">—</p>
                          )}
                        </div>

                        <div className={PANEL}>
                          <p className={SUBLABEL}>Source job link</p>
                          {it.sourceUrl ? (
                            <a
                              href={it.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 break-all text-[14px] text-[#E0480F] dark:text-[#FF5A1F] hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {it.sourceUrl}
                            </a>
                          ) : (
                            <p className="text-[14px]">—</p>
                          )}
                        </div>

                        <div className={PANEL}>
                          <p className={SUBLABEL}>Why this company</p>
                          <p className="whitespace-pre-wrap text-[14px]">
                            {it.whyCompany || "—"}
                          </p>
                        </div>

                        <div className={PANEL}>
                          <p className={SUBLABEL}>Key contacts</p>
                          <ContactList
                            item={it}
                            kind="hr"
                            rows={it.hrContacts}
                            emptyLabel="No contacts found."
                          />
                        </div>

                        <div className={PANEL}>
                          <p className={SUBLABEL}>Potential leads</p>
                          <ContactList
                            item={it}
                            kind="lead"
                            rows={it.potentialLeads}
                            emptyLabel="No potential leads found."
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
