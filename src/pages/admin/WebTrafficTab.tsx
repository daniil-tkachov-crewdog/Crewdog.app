import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageView = {
  id: number;
  occurred_at: string;
  visitor_id: string;
  user_id: string | null;
  email: string | null;
  path: string;
  referrer: string | null;
  ip_prefix: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  user_agent: string | null;
  is_bot: boolean;
};

type Stats = {
  views: number;
  visitors: number;
  signed_in_views: number;
  bot_views: number;
  top_pages: { label: string; views: number }[];
  top_countries: { label: string; views: number }[];
};

const RANGES = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const PAGE_SIZE = 50;

/** Cursor into the log: the last row of the previous page. */
type Cursor = { at: string; id: number } | null;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// ISO 3166-1 alpha-2 maps onto the regional-indicator block, so a flag is just
// the two letters shifted up. Anything that isn't a country code renders blank.
const flag = (code: string | null) => {
  if (!code || code.length !== 2 || !/^[a-z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1a5 + c.charCodeAt(0))
  );
};

const location = (v: PageView) => {
  const parts = [v.city, v.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Unknown";
};

const DEVICE_STYLES: Record<string, string> = {
  desktop: "bg-blue-100 text-blue-700",
  mobile: "bg-green-100 text-green-700",
  tablet: "bg-purple-100 text-purple-700",
  bot: "bg-amber-100 text-amber-700",
};

// Gives each visitor hash a stable colour so repeat visits by the same person
// are groupable by eye without having to read the hash itself.
const VISITOR_COLOURS = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-lime-100 text-lime-700",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

const visitorColour = (id: string) => {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return VISITOR_COLOURS[sum % VISITOR_COLOURS.length];
};

const shortReferrer = (referrer: string | null) => {
  if (!referrer) return "Direct";
  // In-app navigations are logged as the previous path, external ones as a URL.
  if (referrer.startsWith("/")) return referrer;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer;
  }
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border px-3 py-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
  </div>
);

const WebTrafficTab = () => {
  const [range, setRange] = useState<RangeKey>("7d");
  const [includeBots, setIncludeBots] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<PageView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keyset pagination: each entry is the cursor that opens that page, so going
  // back is a lookup rather than a re-query from the top.
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Cursor[]>([null]);
  const [hasMore, setHasMore] = useState(false);

  // Debounce the search box so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to the filters invalidates the cursor stack — start again.
  useEffect(() => {
    setPage(0);
    setCursors([null]);
  }, [range, includeBots, query]);

  const cursor = cursors[page] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Ask for one more row than we show: if it comes back there is a next page.
    const { data, error: rpcError } = await supabase.rpc("admin_list_page_views", {
      p_limit: PAGE_SIZE + 1,
      p_before_at: cursor?.at ?? null,
      p_before_id: cursor?.id ?? null,
      p_include_bots: includeBots,
      p_search: query || null,
      p_range: range,
    });

    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const all = (data as PageView[]) ?? [];
    setHasMore(all.length > PAGE_SIZE);
    setRows(all.slice(0, PAGE_SIZE));
    setLoading(false);
  }, [cursor, includeBots, query, range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stats cover the whole range, so they only depend on the filters, not the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("admin_page_view_stats", {
        p_range: range,
        p_include_bots: includeBots,
      });
      if (!cancelled && !rpcError) setStats(data as Stats);
    })();
    return () => {
      cancelled = true;
    };
  }, [range, includeBots, query]);

  const goNext = () => {
    const last = rows[rows.length - 1];
    if (!last || !hasMore) return;
    const next: Cursor = { at: last.occurred_at, id: last.id };
    setCursors((prev) => {
      const copy = prev.slice(0, page + 1);
      copy.push(next);
      return copy;
    });
    setPage((p) => p + 1);
  };

  const goPrev = () => setPage((p) => Math.max(0, p - 1));

  const topCountry = stats?.top_countries?.[0];
  const topPage = stats?.top_pages?.[0];

  // Keep the scroll position sane when paging through a long table.
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const summary = useMemo(
    () => [
      { label: "Page views", value: (stats?.views ?? 0).toLocaleString() },
      { label: "Unique visitors", value: (stats?.visitors ?? 0).toLocaleString() },
      { label: "Signed in", value: (stats?.signed_in_views ?? 0).toLocaleString() },
      {
        label: "Top country",
        value: topCountry ? `${flag(topCountry.label)} ${topCountry.label}` : "—",
      },
      { label: "Top page", value: topPage ? topPage.label : "—" },
      { label: "Bot hits", value: (stats?.bot_views ?? 0).toLocaleString() },
    ],
    [stats, topCountry, topPage]
  );

  return (
    <div className="space-y-4">
      {/* Range filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeBots}
              onChange={(e) => setIncludeBots(e.target.checked)}
              className="h-3.5 w-3.5 accent-foreground"
            />
            Show bots
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search page, city, country, IP, email…"
            className="h-8 w-64 text-xs"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">Error: {error}</p>}

      {/* Log */}
      <div ref={tableRef} className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Page</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Browser / OS</TableHead>
              <TableHead>Came from</TableHead>
              <TableHead>Visitor</TableHead>
              <TableHead>User</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  Loading traffic…
                </TableCell>
              </TableRow>
            )}

            {!loading && !rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  No visits recorded for this range.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtTime(v.occurred_at)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-medium text-sm" title={v.path}>
                    {v.path}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm" title={v.ip_prefix ?? ""}>
                    <span className="mr-1">{flag(v.country)}</span>
                    {location(v)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        DEVICE_STYLES[v.device_type ?? ""] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {v.device_type ?? "unknown"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs" title={v.user_agent ?? ""}>
                    {v.browser ?? "—"}
                    {v.os && <span className="text-muted-foreground"> · {v.os}</span>}
                  </TableCell>
                  <TableCell
                    className="max-w-[160px] truncate text-xs"
                    title={v.referrer ?? "Direct"}
                  >
                    {shortReferrer(v.referrer)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[11px] ${visitorColour(
                        v.visitor_id
                      )}`}
                      title={v.visitor_id}
                    >
                      {v.visitor_id.slice(0, 6)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs" title={v.email ?? ""}>
                    {v.email ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page + 1}
          {rows.length ? ` · ${rows.length} rows` : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={page === 0 || loading}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} disabled={!hasMore || loading}>
            Next
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        IP addresses are truncated to a network prefix before being stored, and visitor IDs are
        one-way hashes that rotate daily. Rows older than 90 days are purged automatically.
      </p>
    </div>
  );
};

export default WebTrafficTab;
