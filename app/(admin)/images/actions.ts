"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { deleteImage, updateImage, uploadImage } from "@/lib/images";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const KINDS = ["avatar", "work", "icon", "reference"];

function kindOf(fd: FormData): string {
  const k = String(fd.get("kind") ?? "reference");
  if (!KINDS.includes(k)) throw new Error("Pick a kind.");
  return k;
}

export async function upload(formData: FormData) {
  const { supabase, userId } = await requireSuperadmin();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file to upload.");

  const workRaw = text(formData, "work_id");
  const id = await uploadImage(supabase, {
    file,
    kind: kindOf(formData),
    altText: text(formData, "alt_text"),
    caption: text(formData, "caption"),
    workId: workRaw ? Number(workRaw) : null,
    uploadedBy: userId,
  });

  revalidatePath("/images");
  redirect(`/images/${id}?created=1`);
}

export async function save(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  const workRaw = text(formData, "work_id");
  await updateImage(supabase, id, {
    kind: kindOf(formData),
    alt_text: text(formData, "alt_text"),
    caption: text(formData, "caption"),
    work_id: workRaw ? Number(workRaw) : null,
  });

  revalidatePath("/images");
  revalidatePath(`/images/${id}`);
  redirect(`/images/${id}?saved=1`);
}

export async function remove(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Bad id.");

  await deleteImage(supabase, id);

  revalidatePath("/images");
  redirect("/images?deleted=1");
}
