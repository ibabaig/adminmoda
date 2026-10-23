import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export const DEPARTMENTS = ["humour", "poetry", "prints", "film"] as const;
export type DepartmentSlug = (typeof DEPARTMENTS)[number];

export type Work = {
  id: number;
  wing_id: number;
  author_id: string | null;
  department: string;
  origin: string;
  school: string;
  prompt: string;
  model: string;
  title: string | null;
  body: string | null;
  svg_source: string | null;
  caption: string | null;
  image_path: string | null;
  score: number;
  vote_count: number;
  hung_on: string;
  accessioned_at: string | null;
  credit_name: string | null;
  created_at: string;
};

const COLS =
  "id, wing_id, author_id, department, origin, school, prompt, model, title, body, svg_source, caption, image_path, score, vote_count, hung_on, accessioned_at, credit_name, created_at";

export type School = { slug: string; department: string; name: string };

export async function listSchools(db: Db): Promise<School[]> {
  const { data, error } = await db
    .from("schools")
    .select("slug, department, name")
    .order("department")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as School[];
}

export async function listWorks(
  db: Db,
  filter: { department?: string; origin?: string; q?: string } = {}
): Promise<Work[]> {
  let q = db.from("works").select(COLS);
  if (filter.department) q = q.eq("department", filter.department);
  if (filter.origin) q = q.eq("origin", filter.origin);
  if (filter.q) q = q.ilike("body", `%${filter.q}%`);

  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Could not list media: ${error.message}`);
  return (data ?? []) as unknown as Work[];
}

export async function getWork(db: Db, id: number): Promise<Work | null> {
  const { data, error } = await db.from("works").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load media: ${error.message}`);
  return (data as unknown as Work) ?? null;
}

export type WorkPatch = {
  title: string | null;
  body: string | null;
  caption: string | null;
};

export async function updateWork(db: Db, id: number, patch: WorkPatch) {
  // Only the presentational fields. prompt, model, score and vote_count
  // are the record of what happened and are not editable here — a
  // dashboard that can rewrite its own evidence is not a dashboard.
  const { error } = await db
    .from("works")
    .update({ title: patch.title, body: patch.body, caption: patch.caption })
    .eq("id", id);
  if (error) throw new Error(`Could not save: ${error.message}`);
}

export async function deleteWork(db: Db, id: number) {
  const { error } = await db.from("works").delete().eq("id", id);
  if (error) throw new Error(`Could not delete: ${error.message}`);
}

export type NewWork = {
  department: string;
  school: string;
  wingId: number;
  title: string | null;
  body: string | null;
  caption: string | null;
};

export async function createWork(db: Db, input: NewWork) {
  // Hand-entered, so it is marked as the house's and carries a prompt
  // that says so. Leaving prompt blank would put a row in the table
  // that looks generated but has no provenance.
  const { data, error } = await db
    .from("works")
    .insert({
      wing_id: input.wingId,
      author_id: null,
      origin: "house",
      department: input.department,
      school: input.school,
      prompt: "[entered by a curator in the admin area — not model output]",
      model: "manual",
      title: input.title,
      body: input.body,
      caption: input.caption,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create: ${error.message}`);
  return data.id as number;
}

export async function currentWingId(db: Db): Promise<number> {
  const { data, error } = await db.rpc("current_wing_id");
  if (error) throw new Error(`Could not read the open wing: ${error.message}`);
  return data as number;
}
