import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { listWorks, DEPARTMENTS } from "@/lib/media";

const excerpt = (s: string | null, n = 110) =>
  !s ? "" : s.length > n ? `${s.replace(/\s+/g, " ").slice(0, n)}…` : s.replace(/\s+/g, " ");

export default async function MediaIndex({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; origin?: string; q?: string; deleted?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const sp = await searchParams;

  const works = await listWorks(supabase, {
    department: sp.department || undefined,
    origin: sp.origin || undefined,
    q: sp.q || undefined,
  });

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">ACCESSION REGISTER</p>
        <h1>AI-generated media</h1>
        <p className="lede">
          Every work the museum holds, newest first. Read, create, edit and
          deaccession. Prompt, model and tally are shown but not editable — the
          record of what a model produced is evidence, and a dashboard that can
          rewrite its own evidence is not a dashboard.
        </p>
      </header>

      {sp.deleted && <p className="notice">Work deaccessioned. It is gone from the public galleries.</p>}

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="department">Department</label>
          <select id="department" name="department" defaultValue={sp.department ?? ""}>
            <option value="">all</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="origin">Origin</label>
          <select id="origin" name="origin" defaultValue={sp.origin ?? ""}>
            <option value="">all</option>
            <option value="house">the museum</option>
            <option value="member">members</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="q">Text contains</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. subway" />
        </div>
        <button className="btn btn-ghost" type="submit">
          Filter
        </button>
        <Link className="btn" href="/media/new">
          Accession a work
        </Link>
      </form>

      <p className="panel-note">
        {works.length} work{works.length === 1 ? "" : "s"} shown
        {works.length === 200 ? " (capped at 200)" : ""}.
      </p>

      <div className="scroller">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Dept</th>
              <th>School</th>
              <th>Origin</th>
              <th>Work</th>
              <th>Model</th>
              <th>Score</th>
              <th>Votes</th>
              <th>Hung</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {works.map((w) => (
              <tr key={w.id}>
                <td className="mono">{w.id}</td>
                <td className="mono">{w.department}</td>
                <td className="mono muted">{w.school}</td>
                <td className="mono">{w.origin === "house" ? "museum" : "member"}</td>
                <td>
                  {excerpt(w.body ?? w.title) ||
                    (w.svg_source ? "(drawn work)" : "(untitled)")}
                </td>
                <td className="mono muted">{w.model}</td>
                <td className="mono">{w.score > 0 ? `+${w.score}` : w.score}</td>
                <td className="mono">{w.vote_count}</td>
                <td className="mono muted">{w.hung_on.slice(5)}</td>
                <td>
                  {w.accessioned_at ? (
                    <span className="chip chip-acquired">acquired</span>
                  ) : (
                    <span className="chip">on show</span>
                  )}
                </td>
                <td>
                  <Link href={`/media/${w.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
            {works.length === 0 && (
              <tr>
                <td className="muted" colSpan={11}>
                  No work matches that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
