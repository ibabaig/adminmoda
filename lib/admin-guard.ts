import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  name: string;
};

// Called at the top of every page and every server action.
//
// The proxy already redirected anyone who should not be here, so this
// looks redundant. It is not. The proxy's matcher is one regex away
// from accidentally excluding a route, and a server action invoked
// directly does not pass through it at all. This is the check that runs
// in the same process as the query, immediately before it.
//
// And behind both of these sits RLS, which is the only one that cannot
// be bypassed by a mistake in this file.
export async function requireSuperadmin(): Promise<Admin> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const userId = claims.sub as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_superadmin) redirect("/denied");

  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.email ||
    "Curator";

  return { supabase, userId, email: profile.email ?? null, name };
}
