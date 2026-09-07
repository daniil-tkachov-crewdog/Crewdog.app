import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings } from "@/services/settings";
import { toast } from "sonner";

const PromptsTab = () => {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userAddition, setUserAddition] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSystemPrompt(s.system_prompt);
      setUserAddition(s.user_prompt_addition);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        system_prompt: systemPrompt,
        user_prompt_addition: userAddition,
      });
      toast.success("Prompts saved");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
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

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};

export default PromptsTab;
