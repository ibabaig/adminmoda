import type { createClient } from "@/lib/supabase/server";

export type Db = Awaited<ReturnType<typeof createClient>>;

// A field descriptor. The same object drives the list column, the form
// input, and what the server action is willing to write — so a field
// marked readOnly cannot be smuggled in through a crafted POST, because
// the action builds its payload from this list rather than from the
// form data's own keys.
export type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "decimal" | "boolean" | "select" | "ref";
  required?: boolean;
  // Shown on the record page, never written. Provenance and tallies.
  readOnly?: boolean;
  options?: readonly string[];
  // Foreign key: the table it points at and the column to show. Named by
  // table rather than by entity slug on purpose — registry.ts imports
  // this module, so pointing back at an entity would be a cycle.
  ref?: { table: string; labelCol: string };
  hint?: string;
  // Appears as a column in the list view.
  inList?: boolean;
  mono?: boolean;
};

export type Permissions = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type Entity = {
  slug: string;
  table: string;
  label: string;
  singular: string;
  // One sentence on what this table is for, shown above the list.
  blurb: string;
  // Why the permissions are what they are. Shown to the curator, because
  // "why can't I edit this" deserves an answer on the page.
  permissionNote?: string;
  fields: Field[];
  permissions: Permissions;
  orderBy: string;
  ascending?: boolean;
  limit?: number;
};

export type Row = Record<string, unknown> & { id: number };

const selectList = (e: Entity) =>
  ["id", ...e.fields.map((f) => f.name)].join(", ");

export async function listRows(db: Db, e: Entity): Promise<Row[]> {
  const { data, error } = await db
    .from(e.table)
    .select(selectList(e))
    .order(e.orderBy, { ascending: e.ascending ?? false })
    .limit(e.limit ?? 500);

  if (error) throw new Error(`Could not list ${e.label}: ${error.message}`);
  // The select list is long enough on some of these to exceed
  // supabase-js's type-level parser depth, which degrades rows to
  // GenericStringError. The double cast is the documented way out and
  // the same one lib/works.ts uses in the main app.
  return (data ?? []) as unknown as Row[];
}

export async function getRow(db: Db, e: Entity, id: number): Promise<Row | null> {
  const { data, error } = await db
    .from(e.table)
    .select(selectList(e))
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load that ${e.singular}: ${error.message}`);
  return (data as unknown as Row) ?? null;
}

// Turn submitted form data into a payload, taking the shape from the
// entity's own field list. Anything not declared, or declared readOnly,
// is dropped rather than rejected — a hostile POST adding
// is_superadmin=true simply has nowhere to land.
export function payloadFrom(e: Entity, form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const f of e.fields) {
    if (f.readOnly) continue;

    if (f.type === "boolean") {
      // An unchecked checkbox sends nothing at all, so absence is false.
      out[f.name] = form.get(f.name) === "on" || form.get(f.name) === "true";
      continue;
    }

    const raw = form.get(f.name);
    if (raw === null) continue;
    const text = String(raw).trim();

    if (text === "") {
      if (f.required) throw new Error(`${f.label} is required.`);
      out[f.name] = null;
      continue;
    }

    if (f.type === "number" || f.type === "ref") {
      const n = Number(text);
      if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number.`);
      out[f.name] = Math.trunc(n);
    } else if (f.type === "decimal") {
      const n = Number(text);
      if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number.`);
      out[f.name] = n;
    } else if (f.type === "select") {
      if (f.options && !f.options.includes(text)) {
        throw new Error(`${f.label} must be one of: ${f.options.join(", ")}`);
      }
      out[f.name] = text;
    } else {
      out[f.name] = text;
    }
  }

  return out;
}

export async function createRow(db: Db, e: Entity, values: Record<string, unknown>) {
  if (!e.permissions.create) {
    throw new Error(`${e.label} is read-only in the admin area.`);
  }
  const { data, error } = await db.from(e.table).insert(values).select("id").single();
  if (error) throw new Error(`Could not create that ${e.singular}: ${error.message}`);
  return (data as { id: number }).id;
}

export async function updateRow(
  db: Db,
  e: Entity,
  id: number,
  values: Record<string, unknown>
) {
  if (!e.permissions.update) {
    throw new Error(`${e.label} cannot be edited here.`);
  }
  const { error } = await db.from(e.table).update(values).eq("id", id);
  if (error) throw new Error(`Could not save: ${error.message}`);
}

export async function deleteRow(db: Db, e: Entity, id: number) {
  if (!e.permissions.delete) {
    throw new Error(`${e.label} cannot be deleted here.`);
  }
  const { error } = await db.from(e.table).delete().eq("id", id);
  if (error) throw new Error(`Could not delete: ${error.message}`);
}

// Options for a foreign-key <select>, read through the same RLS as
// everything else — so a reference you cannot read is a reference you
// cannot set.
export async function refOptions(
  db: Db,
  table: string,
  labelCol: string
): Promise<{ id: number; label: string }[]> {
  const { data, error } = await db.from(table).select(`id, ${labelCol}`).order(labelCol);
  if (error) return [];
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    label: String(r[labelCol] ?? r.id),
  }));
}

// Every foreign-key field's options, keyed by field name, fetched in one
// round of parallel queries rather than one per row rendered.
export async function loadRefs(
  db: Db,
  e: Entity
): Promise<Record<string, { id: number; label: string }[]>> {
  const refFields = e.fields.filter((f) => f.ref);
  const lists = await Promise.all(
    refFields.map((f) => refOptions(db, f.ref!.table, f.ref!.labelCol))
  );
  return Object.fromEntries(refFields.map((f, i) => [f.name, lists[i]]));
}
