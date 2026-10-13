import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings } from "@/services/settings";
import { toast } from "sonner";

// The two chat paths are configured independently: Normal routes a message
// through the agent workflows, Pro talks to the model directly and gets its
// results back as JSON. Same shell, same Save button, separate fields.
const MODES = [
  { key: "normal", label: "Normal" },
  { key: "pro", label: "Pro" },
] as const;

type ModeKey = (typeof MODES)[number]["key"];

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PromptsTab = () => {
  const [mode, setMode] = useState<ModeKey>("normal");

  const [systemPrompt, setSystemPrompt] = useState("");
  const [userAddition, setUserAddition] = useState("");
  const [proSystemPrompt, setProSystemPrompt] = useState("");
  const [proSchema, setProSchema] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSystemPrompt(s.system_prompt);
      setUserAddition(s.user_prompt_addition);
      setProSystemPrompt(s.pro_system_prompt);
      setProSchema(s.pro_json_schema);
      setLoading(false);
    })();
  }, []);

  // The JSON Output field is a schema, not prose, so it is checked as you type:
  // an unparseable one would be silently ignored at request time and Pro mode
  // would quietly answer without cards.
  const schemaError = useMemo(() => {
    const text = proSchema.trim();
    if (!text) return null; // empty falls back to the built-in default
    try {
      const parsed = JSON.parse(text);
      if (parsed?.schema?.type !== "object") {
        return 'Valid JSON, but not a schema: it needs a "schema" object with "type": "object".';
      }
      return null;
    } catch (e: unknown) {
      return errText(e) || "Invalid JSON";
    }
  }, [proSchema]);

  const save = async () => {
    if (schemaError) return;
    setSaving(true);
    try {
      await saveSettings({
        system_prompt: systemPrompt,
        user_prompt_addition: userAddition,
        pro_system_prompt: proSystemPrompt,
        pro_json_schema: proSchema,
      });
      toast.success("Prompts saved");
    } catch (e: unknown) {
      toast.error(errText(e) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Read back from the server rather than keeping a second copy of the schema
  // in the frontend bundle — proSchema.js is the only source of truth.
  const resetSchema = async () => {
    setResetting(true);
    try {
      const r = await fetch("/api/pro-schema");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProSchema(await r.text());
      toast.success("Schema reset — not saved yet");
    } catch (e: unknown) {
      toast.error(errText(e) || "Could not load the default schema");
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "normal" ? (
        <>
          <section className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <p className="text-xs text-muted-foreground">
              Sent to the model as its system instructions — defines its role and behaviour.
            </p>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder="You are Crewdog, an assistant that…"
            />
          </section>

          <section className="space-y-2">
            <label className="text-sm font-medium">User's Prompt Addition</label>
            <p className="text-xs text-muted-foreground">
              Appended to every user message in the backend — the user never sees it.
            </p>
            <Textarea
              value={userAddition}
              onChange={(e) => setUserAddition(e.target.value)}
              rows={6}
              className="font-mono text-sm"
              placeholder="Always respond concisely and…"
            />
          </section>
        </>
      ) : (
        <>
          <section className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <p className="text-xs text-muted-foreground">
              Pro mode only. The model searches the web itself here — no agents are called —
              so this prompt is the whole instruction set. Nothing from the Normal tab applies.
            </p>
            <Textarea
              value={proSystemPrompt}
              onChange={(e) => setProSystemPrompt(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder="You are Crewdog Pro. Search the web and return…"
            />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">JSON Output</label>
              <Button variant="outline" size="sm" onClick={resetSchema} disabled={resetting}>
                {resetting ? "Loading…" : "Reset to default"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The exact shape every Pro reply must take. Enforced by OpenAI Structured Outputs,
              so the model cannot answer in any other format — which is what lets the backend
              render jobs, accommodation and LinkedIn profiles as cards. Leave it empty to use
              the built-in default.
            </p>
            <Textarea
              value={proSchema}
              onChange={(e) => setProSchema(e.target.value)}
              rows={20}
              spellCheck={false}
              className={`font-mono text-xs ${
                schemaError ? "border-destructive focus-visible:ring-destructive" : ""
              }`}
              placeholder='{ "name": "crewdog_pro_search", "strict": true, "schema": { … } }'
            />
            {schemaError ? (
              <p className="text-xs text-destructive">{schemaError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Every object needs <code>"additionalProperties": false</code> and every property
                listed in <code>"required"</code> — optional fields are typed{" "}
                <code>["string", "null"]</code> instead of being left out. That is what strict
                mode demands.
              </p>
            )}
          </section>
        </>
      )}

      <Button onClick={save} disabled={saving || !!schemaError}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {schemaError && (
        <p className="text-xs text-destructive">Fix the JSON Output schema before saving.</p>
      )}
    </div>
  );
};

export default PromptsTab;
