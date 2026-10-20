// Pro mode's skills, as the admin panel sees them.
//
// The server reads this same table mid-turn to answer load_skill; this module
// is only the editing side. Writes are admin-only at the database, so a
// failure here is a permissions answer, not something to paper over.

import { supabase } from "@/lib/supabase";

export type ProSkill = {
  id: string;
  // What the model passes to load_skill. Derived from the name, never typed.
  slug: string;
  name: string;
  // The one line the core prompt advertises: when to reach for this skill.
  call_instruction: string;
  // The body, loaded on demand. This is where the bulk of Pro's prompt lives.
  prompt: string;
  enabled: boolean;
  // Slugs this skill is attached to, so it loads whenever they do.
  auto_with: string[];
  sort_order: number;
};

const COLUMNS = "id, slug, name, call_instruction, prompt, enabled, auto_with, sort_order";

// A name becomes a tool argument, so it has to survive as [a-z0-9_]. Done here
// rather than asking the admin to type an identifier: a space in a slug is a
// tool call that fails at run time, long after the typo.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export async function listProSkills(): Promise<ProSkill[]> {
  const { data, error } = await supabase
    .from("app_pro_skills")
    .select(COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, auto_with: r.auto_with ?? [] })) as ProSkill[];
}

export async function createProSkill(name: string, sortOrder: number): Promise<ProSkill> {
  const base = slugify(name) || "skill";
  // The slug is unique in the database, so a second "Job Finder" needs a
  // different one rather than a failed insert the admin has to decode.
  const existing = await listProSkills();
  let slug = base;
  for (let n = 2; existing.some((s) => s.slug === slug); n++) slug = `${base}_${n}`;

  const { data, error } = await supabase
    .from("app_pro_skills")
    .insert({ slug, name, sort_order: sortOrder })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ...data, auto_with: data.auto_with ?? [] } as ProSkill;
}

export async function updateProSkill(
  id: string,
  patch: Partial<Omit<ProSkill, "id">>
): Promise<void> {
  const { error } = await supabase
    .from("app_pro_skills")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProSkill(id: string): Promise<void> {
  const { error } = await supabase.from("app_pro_skills").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
