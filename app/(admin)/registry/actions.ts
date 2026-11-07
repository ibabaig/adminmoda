"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { findEntity } from "@/lib/registry";
import { createRow, deleteRow, payloadFrom, updateRow } from "@/lib/crud";

// Every action re-runs the guard and re-reads the entity's declared
// permissions. A server action is its own POST endpoint; it does not
// inherit authorisation from the page that rendered the form, and it
// does not inherit "the button wasn't shown" either.
//
// Behind this sit the RLS policies from migration 010, which have no
// matching policy at all where an entity says read-only. So a bug in
// this file is refused by Postgres rather than merely unnoticed.

function entityOr404(slug: string) {
  const e = findEntity(slug);
  if (!e) throw new Error(`No such registry: ${slug}`);
  return e;
}

export async function createEntityRow(slug: string, formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const e = entityOr404(slug);

  const id = await createRow(supabase, e, payloadFrom(e, formData));

  revalidatePath(`/registry/${slug}`);
  redirect(`/registry/${slug}/${id}?created=1`);
}

export async function updateEntityRow(slug: string, formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const e = entityOr404(slug);

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  await updateRow(supabase, e, id, payloadFrom(e, formData));

  revalidatePath(`/registry/${slug}`);
  revalidatePath(`/registry/${slug}/${id}`);
  redirect(`/registry/${slug}/${id}?saved=1`);
}

export async function deleteEntityRow(slug: string, formData: FormData) {
  const { supabase } = await requireSuperadmin();
  const e = entityOr404(slug);

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  await deleteRow(supabase, e, id);

  revalidatePath(`/registry/${slug}`);
  redirect(`/registry/${slug}?deleted=1`);
}
