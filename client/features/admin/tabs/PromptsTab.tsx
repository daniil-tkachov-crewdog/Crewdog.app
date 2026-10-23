import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { getSettings, saveSettings } from "@/features/admin/api/settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listProSkills,
  createProSkill,
  updateProSkill,
  deleteProSkill,
  uniqueSlug,
  type ProSkill,
} from "@/features/admin/api/proSkills";
import { toast } from "sonner";

// The two chat paths are configured independently: Normal routes a message
// through the agent workflows, Pro talks to the model directly and loads its
// search instructions as skills.
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

  const [skills, setSkills] = useState<ProSkill[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [schemaOpen, setSchemaOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // The create dialog. A skill is a name, the one line that advertises it and
  // the body — asking for all three up front beats creating an empty row and
  // hoping someone remembers to come back and fill it in.
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    call_instruction: "",
    prompt: "",
    auto_with: [] as string[],
  });

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSystemPrompt(s.system_prompt);
      setUserAddition(s.user_prompt_addition);
      setProSystemPrompt(s.pro_system_prompt);

      // An empty column means "use the built-in schema", which used to render
      // as a blank box with no hint of what was actually in force. Show the
      // real thing instead, editable from the first keystroke.
      if (s.pro_json_schema.trim()) {
        setProSchema(s.pro_json_schema);
      } else {
        try {
          const r = await fetch("/api/pro-schema");
          if (r.ok) setProSchema(await r.text());
        } catch {
          /* leave it empty; the server falls back to the same default anyway */
        }
      }

      try {
        setSkills(await listProSkills());
      } catch (e: unknown) {
        toast.error(`Could not load skills: ${errText(e)}`);
      }
      setLoading(false);
    })();
  }, []);

  // The JSON Output field is a schema, not prose, so it is checked as you type:
  // an unparseable one is silently ignored at request time and Pro would
  // quietly answer without cards.
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

  const patchSkill = (id: string, patch: Partial<ProSkill>) =>
    setSkills((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

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
      for (const s of skills) {
        await updateProSkill(s.id, {
          name: s.name,
          call_instruction: s.call_instruction,
          prompt: s.prompt,
          enabled: s.enabled,
          auto_with: s.auto_with,
          sort_order: s.sort_order,
        });
      }
      toast.success("Prompts saved");
    } catch (e: unknown) {
      toast.error(errText(e) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openAddDialog = () => {
    setDraft({ name: "", call_instruction: "", prompt: "", auto_with: [] });
    setAddOpen(true);
  };

  const addSkill = async () => {
    const name = draft.name.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await createProSkill({
        name,
        call_instruction: draft.call_instruction.trim(),
        prompt: draft.prompt,
        auto_with: draft.auto_with,
        sort_order: skills.length,
      });
      setSkills((list) => [...list, created]);
      setOpen((o) => ({ ...o, [created.id]: true }));
      setAddOpen(false);
      toast.success(`${created.name} created`);
    } catch (e: unknown) {
      toast.error(errText(e) || "Could not add the skill");
    } finally {
      setAdding(false);
    }
  };

  const removeSkill = async (skill: ProSkill) => {
    if (!window.confirm(`Delete "${skill.name}"? This cannot be undone.`)) return;
    try {
      await deleteProSkill(skill.id);
      setSkills((list) => list.filter((s) => s.id !== skill.id));
    } catch (e: unknown) {
      toast.error(errText(e) || "Could not delete the skill");
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
              Pro mode only, and always in context. Keep it to who Crewdog is, the scope
              rules and the output contract — the detail of each search belongs in a skill
              below, so it is only loaded when it is needed.
            </p>
            <Textarea
              value={proSystemPrompt}
              onChange={(e) => setProSystemPrompt(e.target.value)}
              rows={14}
              className="font-mono text-sm"
              placeholder="You are Crewdog. You help people into DATA CENTRE work…"
            />
            <p className="text-xs text-muted-foreground">
              {proSystemPrompt.length.toLocaleString()} characters in context on every
              message.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Skills</label>
                <p className="text-xs text-muted-foreground">
                  Loaded on demand. The model only ever sees each skill's name and call
                  instruction until it asks for one.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={openAddDialog}>
                <Plus className="mr-1 h-4 w-4" />
                Add skill
              </Button>
            </div>

            {skills.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                No skills yet. Pro will answer from the system prompt alone and return no
                cards.
              </p>
            )}

            <div className="space-y-2">
              {skills.map((skill) => (
                <div key={skill.id} className="rounded-lg border">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [skill.id]: !o[skill.id] }))}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          open[skill.id] ? "rotate-90" : ""
                        }`}
                      />
                      <span className="text-sm font-medium">{skill.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {skill.slug}
                      </code>
                      {!skill.enabled && (
                        <span className="text-[11px] text-muted-foreground">disabled</span>
                      )}
                    </button>
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={(v) => patchSkill(skill.id, { enabled: v })}
                    />
                    <button
                      onClick={() => removeSkill(skill)}
                      aria-label={`Delete ${skill.name}`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {open[skill.id] && (
                    <div className="space-y-4 border-t px-3 py-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Name</label>
                        <Input
                          value={skill.name}
                          onChange={(e) => patchSkill(skill.id, { name: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Shown to the user while the skill loads. The slug{" "}
                          <code>{skill.slug}</code> is what the model calls and never
                          changes, so a rename cannot break a conversation in flight.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Call instruction</label>
                        <Textarea
                          value={skill.call_instruction}
                          onChange={(e) =>
                            patchSkill(skill.id, { call_instruction: e.target.value })
                          }
                          rows={2}
                          className="font-mono text-xs"
                          placeholder="Load this when the user is looking for open vacancies…"
                        />
                        <p className="text-xs text-muted-foreground">
                          Always in context — one line, on when to reach for this skill.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Skill prompt</label>
                        <Textarea
                          value={skill.prompt}
                          onChange={(e) => patchSkill(skill.id, { prompt: e.target.value })}
                          rows={16}
                          spellCheck={false}
                          className="font-mono text-xs"
                          placeholder="The full instructions for this kind of search…"
                        />
                        <p className="text-xs text-muted-foreground">
                          {skill.prompt.length.toLocaleString()} characters, loaded only
                          when this skill is called.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Also load with</label>
                        <div className="flex flex-wrap gap-3">
                          {skills
                            .filter((o) => o.id !== skill.id)
                            .map((other) => (
                              <label
                                key={other.id}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={skill.auto_with.includes(other.slug)}
                                  onChange={(e) =>
                                    patchSkill(skill.id, {
                                      auto_with: e.target.checked
                                        ? [...skill.auto_with, other.slug]
                                        : skill.auto_with.filter((s) => s !== other.slug),
                                    })
                                  }
                                />
                                {other.name}
                              </label>
                            ))}
                          {skills.length < 2 && <span className="text-xs">—</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This skill is attached automatically whenever one of the ticked
                          skills loads. Use it for reference material the model would not
                          think to ask for.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <button
              onClick={() => setSchemaOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  schemaOpen ? "rotate-90" : ""
                }`}
              />
              JSON Output
              {schemaError && (
                <span className="text-xs font-normal text-destructive">invalid</span>
              )}
            </button>

            {schemaOpen && (
              <div className="space-y-2 pt-1">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xs text-muted-foreground">
                    The exact shape every Pro reply must take. Enforced by OpenAI
                    Structured Outputs, so the model cannot answer in any other format —
                    which is what lets the backend render jobs, accommodation and LinkedIn
                    profiles as cards.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetSchema}
                    disabled={resetting}
                    className="shrink-0"
                  >
                    {resetting ? "Loading…" : "Reset to default"}
                  </Button>
                </div>
                <Textarea
                  value={proSchema}
                  onChange={(e) => setProSchema(e.target.value)}
                  rows={20}
                  spellCheck={false}
                  className={`font-mono text-xs ${
                    schemaError ? "border-destructive focus-visible:ring-destructive" : ""
                  }`}
                />
                {schemaError ? (
                  <p className="text-xs text-destructive">{schemaError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Every object needs <code>"additionalProperties": false</code> and every
                    property listed in <code>"required"</code> — optional fields are typed{" "}
                    <code>["string", "null"]</code> instead of being left out. That is what
                    strict mode demands.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={(v) => !adding && setAddOpen(v)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New skill</DialogTitle>
            <DialogDescription>
              The model sees the name and the call instruction at all times. It only
              sees the prompt once it decides to load the skill.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name</label>
              <Input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Job Finder"
              />
              <p className="text-xs text-muted-foreground">
                {draft.name.trim() ? (
                  <>
                    The model will call it{" "}
                    <code>{uniqueSlug(draft.name, skills.map((s) => s.slug))}</code>. The
                    slug is fixed once created, so a later rename cannot break a
                    conversation in flight.
                  </>
                ) : (
                  "Used in the panel and in the status line the user sees while it loads."
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Call instruction</label>
              <Textarea
                value={draft.call_instruction}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, call_instruction: e.target.value }))
                }
                rows={2}
                className="font-mono text-xs"
                placeholder="Load this when the user is looking for open vacancies…"
              />
              <p className="text-xs text-muted-foreground">
                Always in context — one line, on when to reach for this skill.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Skill prompt</label>
              <Textarea
                value={draft.prompt}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                rows={12}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder="The full instructions for this kind of search…"
              />
              <p className="text-xs text-muted-foreground">
                {draft.prompt.length.toLocaleString()} characters, loaded only when this
                skill is called. Can be left empty and filled in later.
              </p>
            </div>

            {skills.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Also load with</label>
                <div className="flex flex-wrap gap-3">
                  {skills.map((other) => (
                    <label
                      key={other.id}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={draft.auto_with.includes(other.slug)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            auto_with: e.target.checked
                              ? [...d.auto_with, other.slug]
                              : d.auto_with.filter((x) => x !== other.slug),
                          }))
                        }
                      />
                      {other.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Attach this skill to others so it loads with them. For reference
                  material the model would not think to ask for.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={addSkill} disabled={adding || !draft.name.trim()}>
              {adding ? "Creating…" : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
