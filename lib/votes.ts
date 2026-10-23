import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type VoteRow = {
  id: number;
  value: number;
  created_at: string;
  workId: number;
  workDepartment: string;
  workSchool: string;
  workExcerpt: string;
  voterName: string;
};

// READ only. Worth stating plainly: for a member, the ballot is secret
// — the RLS select policy returns only their own rows. A superadmin can
// read all of them, because moderating a rating system means being able
// to see when someone is gaming it. That asymmetry is the point, and it
// lives in the policy, not in this file.
export async function listVotes(db: Db, limit = 200): Promise<VoteRow[]> {
  const [votesRes, worksRes, peopleRes] = await Promise.all([
    db.from("votes")
      .select("id, work_id, voter_id, value, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    db.from("works").select("id, department, school, title, body"),
    db.from("profiles").select("id, first_name, last_name, email"),
  ]);

  if (votesRes.error) throw new Error(`Could not list votes: ${votesRes.error.message}`);

  const works = new Map((worksRes.data ?? []).map((w) => [w.id, w]));
  const people = new Map((peopleRes.data ?? []).map((p) => [p.id, p]));

  return (votesRes.data ?? []).map((v) => {
    const w = works.get(v.work_id);
    const p = people.get(v.voter_id);
    const text = w?.body ?? w?.title ?? "";
    return {
      id: v.id,
      value: v.value,
      created_at: v.created_at,
      workId: v.work_id,
      workDepartment: w?.department ?? "—",
      workSchool: w?.school ?? "—",
      workExcerpt: text.length > 90 ? `${text.slice(0, 90)}…` : text || "(visual work)",
      voterName:
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        p?.email ||
        "Unknown member",
    };
  });
}
