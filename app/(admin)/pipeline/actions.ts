"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { retuneMix } from "@/lib/pipeline";

export async function retune(formData: FormData) {
  const { supabase } = await requireSuperadmin();

  const mixId = Number(formData.get("mixId"));
  if (!Number.isInteger(mixId)) throw new Error("Bad mix id.");

  await retuneMix(
    supabase,
    mixId,
    Number(formData.get("weight")),
    formData.get("is_active") === "on"
  );

  revalidatePath("/pipeline");
  redirect("/pipeline?retuned=1");
}
