import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  getSettings,
  saveSettings,
  type SeoFaqItem,
  type SeoSettings,
} from "@/services/settings";
import { toast } from "sonner";

// Google truncates around these lengths; the counters turn amber past them.
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

const Field = ({
  label,
  hint,
  limit,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint: string;
  limit?: number;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) => (
  <section className="space-y-2">
    <div className="flex items-baseline justify-between gap-4">
      <label className="text-sm font-medium">{label}</label>
      {limit ? (
        <span
          className={`text-xs tabular-nums ${
            value.length > limit ? "text-amber-600" : "text-muted-foreground"
          }`}
        >
          {value.length}/{limit}
        </span>
      ) : null}
    </div>
    <p className="text-xs text-muted-foreground">{hint}</p>
    {rows ? (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="text-sm"
      />
    ) : (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
      />
    )}
  </section>
);

const SeoTab = () => {
  const [seo, setSeo] = useState<SeoSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSeo(s.seo ?? {});
      setLoading(false);
    })();
  }, []);

  const set = (key: keyof SeoSettings) => (v: string) =>
    setSeo((prev) => ({ ...prev, [key]: v }));

  const val = (key: keyof SeoSettings) => (seo[key] as string) ?? "";

  const faq: SeoFaqItem[] = seo.faq ?? [];

  const setFaq = (next: SeoFaqItem[]) =>
    setSeo((prev) => ({ ...prev, faq: next }));

  const updateFaq = (i: number, patch: Partial<SeoFaqItem>) =>
    setFaq(faq.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const save = async () => {
    setSaving(true);
    try {
      // Drop blank Q&A pairs so they never reach the structured data.
      const cleaned: SeoSettings = {
        ...seo,
        faq: faq.filter((f) => f.q.trim() && f.a.trim()),
      };
      await saveSettings({ seo: cleaned });
      setSeo(cleaned);
      toast.success("SEO saved — live within a minute");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        These fields are written into the page's HTML by the server on every
        request, so search engines and AI crawlers read them without running any
        JavaScript. Changes go live within about a minute — no deploy needed.
      </p>

      <div className="space-y-6">
        <h2 className="text-sm font-semibold">Search results</h2>
        <Field
          label="Page title"
          hint="The clickable headline in Google results and the browser tab."
          limit={TITLE_LIMIT}
          value={val("title")}
          onChange={set("title")}
        />
        <Field
          label="Meta description"
          hint="The grey summary under the title in search results."
          limit={DESCRIPTION_LIMIT}
          rows={3}
          value={val("description")}
          onChange={set("description")}
        />
        <Field
          label="Keywords"
          hint="Comma-separated. Ignored by Google, still read by some AI crawlers."
          rows={2}
          value={val("keywords")}
          onChange={set("keywords")}
        />
        <Field
          label="Canonical URL"
          hint="The one address this page should be indexed under."
          value={val("canonical")}
          onChange={set("canonical")}
        />
      </div>

      <div className="space-y-6">
        <h2 className="text-sm font-semibold">Link previews</h2>
        <p className="-mt-4 text-xs text-muted-foreground">
          Shown when the site is shared on LinkedIn, Slack, WhatsApp or X.
        </p>
        <Field
          label="Open Graph title"
          hint="Headline on the shared link card."
          value={val("og_title")}
          onChange={set("og_title")}
        />
        <Field
          label="Open Graph description"
          hint="Body text on the shared link card."
          rows={3}
          value={val("og_description")}
          onChange={set("og_description")}
        />
        <Field
          label="Preview image URL"
          hint="Full URL to a 1200×630 image."
          value={val("og_image")}
          onChange={set("og_image")}
        />
        <Field
          label="X (Twitter) title"
          hint="Leave blank to reuse the Open Graph title."
          value={val("twitter_title")}
          onChange={set("twitter_title")}
        />
        <Field
          label="X (Twitter) description"
          hint="Leave blank to reuse the Open Graph description."
          rows={3}
          value={val("twitter_description")}
          onChange={set("twitter_description")}
        />
      </div>

      <div className="space-y-6">
        <h2 className="text-sm font-semibold">Structured data</h2>
        <p className="-mt-4 text-xs text-muted-foreground">
          Machine-readable descriptions. This is what AI search tools quote when
          someone asks them what CrewDog is.
        </p>
        <Field
          label="Organisation description"
          hint="Describes CrewDog the company."
          rows={3}
          value={val("org_description")}
          onChange={set("org_description")}
        />
        <Field
          label="Product description"
          hint="Describes CrewDog the software."
          rows={3}
          value={val("app_description")}
          onChange={set("app_description")}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">FAQ</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFaq([...faq, { q: "", a: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add question
          </Button>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Answers here can appear directly in Google and are a primary source for
          AI search answers. Write them as plain, complete sentences.
        </p>

        {faq.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet.</p>
        ) : (
          faq.map((item, i) => (
            <div key={i} className="space-y-2 rounded-md border p-4">
              <div className="flex items-start gap-2">
                <Input
                  value={item.q}
                  onChange={(e) => updateFaq(i, { q: e.target.value })}
                  placeholder="Question"
                  className="text-sm font-medium"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove question"
                  onClick={() => setFaq(faq.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={item.a}
                onChange={(e) => updateFaq(i, { a: e.target.value })}
                placeholder="Answer"
                rows={3}
                className="text-sm"
              />
            </div>
          ))
        )}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};

export default SeoTab;
