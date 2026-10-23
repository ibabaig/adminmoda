import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type Person = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  is_superadmin: boolean;
  updated_at: string;
};

export type PersonRow = Person & {
  works: number;
  acquired: number;
  votesCast: number;
};

// READ only, per the brief. There is deliberately no update or delete
// policy on profiles for superadmins, so even if this file grew a
// write the database would refuse it.
export async function listPeople(db: Db): Promise<PersonRow[]> {
  const [peopleRes, worksRes, votesRes] = await Promise.all([
    db.from("profiles")
      .select("id, email, first_name, last_name, avatar_path, is_superadmin, updated_at")
      .order("updated_at", { ascending: false }),
    db.from("works").select("author_id, accessioned_at"),
    db.from("votes").select("voter_id"),
  ]);

  if (peopleRes.error) throw new Error(`Could not list people: ${peopleRes.error.message}`);

  const works = worksRes.data ?? [];
  const votes = votesRes.data ?? [];

  return (peopleRes.data ?? []).map((p) => {
    const mine = works.filter((w) => w.author_id === p.id);
    return {
      ...(p as Person),
      works: mine.length,
      acquired: mine.filter((w) => w.accessioned_at).length,
      votesCast: votes.filter((v) => v.voter_id === p.id).length,
    };
  });
}
