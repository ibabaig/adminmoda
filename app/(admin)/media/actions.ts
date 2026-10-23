"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import {
  createWork,
  currentWingId,
  deleteWork,
  updateWork,
  DEPARTMENTS,
} from "@/lib/media";

// Every action re-runs the guard. A server action is a POST endpoint
// with a generated URL — it does not inherit the page's authorisation
// just because the form that calls it was rendered on a gated page.

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

export async function saveWork(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  await updateWork(supabase, id, {
    title: text(formData, "title"),
    body: text(formData, "body"),
    caption: text(formData, "caption"),
  });

  revalidatePath("/media");
  revalidatePath(`/media/${id}`);
  redirect(`/media/${id}?saved=1`);
}

export async function removeWork(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  await deleteWork(supabase, id);

  revalidatePath("/media");
  revalidatePath("/");
  redirect("/media?deleted=1");
}

export async function addWork(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const department = String(formData.get("department") ?? "");
  if (!DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number])) {
    throw new Error("Pick a department.");
  }

  const school = String(formData.get("school") ?? "").trim();
  if (!school) throw new Error("Pick a school.");

  const body = text(formData, "body");
  const title = text(formData, "title");
  if (!body && !title) throw new Error("A work needs a title or a body.");

  const wingId = await currentWingId(supabase);

  const id = await createWork(supabase, {
    department,
    school,
    wingId,
    title,
    body,
    caption: text(formData, "caption"),
  });

  revalidatePath("/media");
  revalidatePath("/");
  redirect(`/media/${id}?created=1`);
}
