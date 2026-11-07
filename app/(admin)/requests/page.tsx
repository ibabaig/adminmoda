import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { loadPipeline } from "@/lib/pipeline";

const ms = (n: number | null) => (n === null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
const pc = (n: number) => `${Math.round(n * 100)}%`;
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}`;
};

export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; department?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const sp = await searchParams;
  const { requests, metrics: m } = await loadPipeline(supabase, 300);

  const shown = requests.filter(
    (r) =>
      (!sp.status || r.status === sp.status) &&
      (!sp.department || r.department === sp.department)
  );

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">GENERATION REQUESTS</p>
        <h1>What the museum actually asked for</h1>
        <p className="lede">
          One row per attempt, written before the model is called and completed
          afterwards — so a row stuck at <span className="mono">pending</span>{" "}
          is itself a finding: the process died mid-generation. Everything on
          this page is read-only, and the database grants no write policy to
          match.
        </p>
      </header>

      <section className="panel">
        <h2>The numbers this makes available</h2>
        <p className="panel-note">
          Latency percentiles are nearest-rank over the last {requests.length}{" "}
          attempts. With a handful of samples anything cleverer is precision the
          data has not earned.
        </p>
        <div className="figures">
          <Figure n={String(m.attempts)} label="attempts" />
          <Figure n={pc(m.successRate)} label="success rate" sub={`${m.failed} failed, ${m.pending} stuck`} />
          <Figure n={ms(m.p50)} label="p50 latency" />
          <Figure n={ms(m.p95)} label="p95 latency" />
          <Figure
            n={m.sanitiser.checked ? pc(m.sanitiser.rate) : "—"}
            label="SVG rejection rate"
            sub={`${m.sanitiser.rejected} of ${m.sanitiser.checked} checked`}
          />
        </div>
      </section>

      <section className="panel panel-split">
        <div>
          <h2>By department</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Dept</th><th>Tried</th><th>OK</th><th>Failed</th>
                <th>Rate</th><th>p50</th><th>p95</th>
              </tr>
            </thead>
            <tbody>
              {m.byDepartment.map((d) => (
                <tr key={d.department}>
                  <td className="mono">{d.department}</td>
                  <td>{d.attempts}</td>
                  <td>{d.succeeded}</td>
                  <td>{d.failed}</td>
                  <td className="mono">{pc(d.successRate)}</td>
                  <td className="mono">{ms(d.p50)}</td>
                  <td className="mono">{ms(d.p95)}</td>
                </tr>
              ))}
              {m.byDepartment.length === 0 && (
                <tr><td className="muted" colSpan={7}>No attempts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h2>How the model stopped</h2>
          <p className="panel-note">
            <span className="mono">STOP</span> is healthy.{" "}
            <span className="mono">MAX_TOKENS</span> means the budget ran out
            mid-thought — the exact failure that made poetry return nothing,
            since thinking and output share one allowance.
          </p>
          <ul className="tally">
            {m.finishReasons.map((f) => (
              <li key={f.reason}>
                <span className="mono">{f.reason}</span>
                <strong>{f.n}</strong>
              </li>
            ))}
            {m.finishReasons.length === 0 && (
              <li className="muted">No responses recorded yet.</li>
            )}
          </ul>

          {m.failures.length > 0 && (
            <>
              <h2 style={{ marginTop: "28px" }}>Why attempts failed</h2>
              <ul className="tally">
                {m.failures.slice(0, 8).map((f) => (
                  <li key={f.reason}>
                    <span>{f.reason.length > 70 ? `${f.reason.slice(0, 70)}…` : f.reason}</span>
                    <strong>{f.n}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Every attempt</h2>
        <form className="filters" method="get">
          <div className="field field-tight">
            <label htmlFor="department">Department</label>
            <select id="department" name="department" defaultValue={sp.department ?? ""}>
              <option value="">all</option>
              {["humour", "poetry", "prints", "film"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field field-tight">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={sp.status ?? ""}>
              <option value="">all</option>
              {["succeeded", "failed", "pending"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost" type="submit">Filter</button>
        </form>

        <div className="scroller">
          <table className="data">
            <thead>
              <tr>
                <th>When</th><th>Who</th><th>Dept</th><th>School</th>
                <th>Chain</th><th>Status</th><th>Finish</th>
                <th>Took</th><th>Tokens</th><th>Work</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{when(r.created_at)}</td>
                  <td>{r.requesterName}</td>
                  <td className="mono">{r.department}</td>
                  <td className="mono muted">{r.school ?? "—"}</td>
                  <td className="mono muted">{r.chainSlug ?? "—"}</td>
                  <td>
                    <span className={`chip chip-${r.status === "succeeded" ? "acquired" : r.status}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="mono">
                    {r.finishReason ?? "—"}
                    {r.sanitiserOk === false && (
                      <span className="muted"> · sanitiser: {r.sanitiserReason}</span>
                    )}
                  </td>
                  <td className="mono">{ms(r.duration_ms)}</td>
                  <td className="mono muted">
                    {r.totalTokens ?? "—"}
                    {r.thoughtTokens ? ` (${r.thoughtTokens} thought)` : ""}
                  </td>
                  <td>
                    {r.work_id ? <Link href={`/media/${r.work_id}`}>#{r.work_id}</Link> : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td className="muted" colSpan={10}>
                    {requests.length === 0
                      ? "Nothing recorded yet. This fills up once the main app is wired to log its commissions."
                      : "No attempt matches that filter."}
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

function Figure({ n, label, sub }: { n: string; label: string; sub?: string }) {
  return (
    <div className="figure">
      <strong>{n}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}
