import { Textarea } from "@/components/ui/textarea";
import type { AgentConfig } from "@/services/settings";

type Props = {
  label: string;
  hint?: string;
  /** Placeholders the app fills in at run time, e.g. ["request", "today"]. */
  placeholders?: string[];
  value: string | undefined;
  fallback: string;
  onChange: (v: string) => void;
  rows?: number;
};

// One editable prompt. Every string this app sends to a model is one of these,
// so they all look and behave the same: the saved text if there is one, the
// built-in default if there is not, and the placeholders named underneath so
// nobody has to guess what {{request}} will become.
export const PromptField = ({
  label,
  hint,
  placeholders,
  value,
  fallback,
  onChange,
  rows = 10,
}: Props) => (
  <section className="space-y-2">
    <label className="text-sm font-medium">{label}</label>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    <Textarea
      value={value ?? fallback}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="font-mono text-sm"
    />
    {!!placeholders?.length && (
      <p className="text-xs text-muted-foreground">
        Filled in at run time:{" "}
        {placeholders.map((p, i) => (
          <span key={p}>
            {i > 0 && ", "}
            <code className="rounded bg-muted px-1 py-0.5">{`{{${p}}}`}</code>
          </span>
        ))}
      </p>
    )}
  </section>
);

export type SetCfg = (
  k: keyof AgentConfig,
  v: string | number | boolean | string[]
) => void;

export default PromptField;
