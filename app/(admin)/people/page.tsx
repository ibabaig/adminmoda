import { requireSuperadmin } from "@/lib/admin-guard";
import { listPeople } from "@/lib/people";

export default async function People() {
  const { supabase, userId } = await requireSuperadmin();
  const people = await listPeople(supabase);

  const active = people.filter((p) => p.works > 0 || p.votesCast > 0).length;

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">MEMBERSHIP</p>
        <h1>Profiles</h1>
        <p className="lede">
          Read-only, and not as a shortcut. There is no update or delete policy
          on <span className="mono">profiles</span> for curators — only the
          narrow one that lets a member edit their own name and avatar. If this
          page grew an edit button, Postgres would refuse the query.
        </p>
      </header>

      <div className="figures" style={{ marginBottom: "36px" }}>
        <Figure n={people.length} label="members" />
        <Figure n={active} label="have done something" sub="voted or commissioned" />
        <Figure n={people.filter((p) => p.is_superadmin).length} label="curators" />
        <Figure
          n={people.filter((p) => !p.first_name && !p.last_name).length}
          label="unnamed"
          sub="signed in, never finished onboarding"
        />
      </div>

      <div className="scroller">
        <table className="data">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Role</th>
              <th>Commissioned</th>
              <th>Acquired</th>
              <th>Hit rate</th>
              <th>Votes cast</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const name =
                [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—";
              return (
                <tr key={p.id}>
                  <td>
                    {name}
                    {p.id === userId && <span className="muted"> (you)</span>}
                  </td>
                  <td className="mono muted">{p.email ?? "—"}</td>
                  <td>
                    {p.is_superadmin ? (
                      <span className="chip chip-acquired">curator</span>
                    ) : (
                      <span className="chip">member</span>
                    )}
                  </td>
                  <td className="mono">{p.works}</td>
                  <td className="mono">{p.acquired}</td>
                  <td className="mono">
                    {p.works ? `${Math.round((p.acquired / p.works) * 100)}%` : "—"}
                  </td>
                  <td className="mono">{p.votesCast}</td>
                  <td className="mono muted">{p.updated_at.slice(0, 10)}</td>
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr>
                <td className="muted" colSpan={8}>
                  Nobody has signed up yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
