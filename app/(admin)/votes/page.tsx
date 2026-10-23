import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { listVotes } from "@/lib/votes";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}`;
};

export default async function Votes() {
  const { supabase } = await requireSuperadmin();
  const votes = await listVotes(supabase, 200);

  const up = votes.filter((v) => v.value === 1).length;
  const down = votes.length - up;

  // Who is voting the most, and how one-note is their taste? A member
  // who has cast forty votes all in the same direction is not judging,
  // they are clicking.
  const byVoter = new Map<string, { up: number; down: number }>();
  for (const v of votes) {
    const t = byVoter.get(v.voterName) ?? { up: 0, down: 0 };
    if (v.value === 1) t.up += 1;
    else t.down += 1;
    byVoter.set(v.voterName, t);
  }
  const voters = [...byVoter.entries()]
    .map(([voterName, t]) => ({
      voterName,
      ...t,
      total: t.up + t.down,
      lean: Math.abs(t.up - t.down) / Math.max(1, t.up + t.down),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">THE BALLOTS</p>
        <h1>Upvotes and downvotes</h1>
        <p className="lede">
          For a member the ballot is secret — the select policy on{" "}
          <span className="mono">votes</span> returns only their own rows, which
          is what lets the museum run blind judging. A curator reads all of
          them, because moderating a rating system means being able to see it
          being gamed. The asymmetry lives in the policy, not in this page.
        </p>
      </header>

      <div className="figures" style={{ marginBottom: "36px" }}>
        <Figure n={votes.length} label="ballots shown" sub="most recent 200" />
        <Figure n={up} label="upvotes" />
        <Figure n={down} label="downvotes" />
        <Figure n={byVoter.size} label="distinct voters" />
      </div>

      <section className="panel">
        <h2>Who is actually voting</h2>
        <p className="panel-note">
          Conviction is the share of a member&apos;s votes that went one way.
          100% across a lot of ballots is a member who is clicking, not judging
          — the signal you want when deciding whether a score means anything.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Member</th>
              <th>Up</th>
              <th>Down</th>
              <th>Total</th>
              <th>Conviction</th>
            </tr>
          </thead>
          <tbody>
            {voters.map((v) => (
              <tr key={v.voterName}>
                <td>{v.voterName}</td>
                <td className="mono">{v.up}</td>
                <td className="mono">{v.down}</td>
                <td className="mono">{v.total}</td>
                <td className="mono">{Math.round(v.lean * 100)}%</td>
              </tr>
            ))}
            {voters.length === 0 && (
              <tr>
                <td className="muted" colSpan={5}>
                  Nobody has voted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Every ballot, newest first</h2>
        <div className="scroller">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Vote</th>
                <th>Member</th>
                <th>Dept</th>
                <th>School</th>
                <th>On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {votes.map((v) => (
                <tr key={v.id}>
                  <td className="mono muted">{when(v.created_at)}</td>
                  <td className="mono" style={{ color: v.value === 1 ? "var(--ink)" : "var(--signal)" }}>
                    {v.value === 1 ? "▲ up" : "▼ down"}
                  </td>
                  <td>{v.voterName}</td>
                  <td className="mono">{v.workDepartment}</td>
                  <td className="mono muted">{v.workSchool}</td>
                  <td>{v.workExcerpt}</td>
                  <td>
                    <Link href={`/media/${v.workId}`}>#{v.workId}</Link>
                  </td>
                </tr>
              ))}
              {votes.length === 0 && (
                <tr>
                  <td className="muted" colSpan={7}>
                    No ballots cast yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Figure({ n, label, sub }: { n: number; label: string; sub?: string }) {
  return (
    <div className="figure">
      <strong>{n.toLocaleString()}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}
