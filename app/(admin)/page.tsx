import { requireSuperadmin } from "@/lib/admin-guard";
import { loadDashboard } from "@/lib/stats";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const fixed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default async function Dashboard() {
  const { supabase, name } = await requireSuperadmin();
  const d = await loadDashboard(supabase);

  const maxBar = Math.max(1, ...d.funnel.map((f) => f.hung));
  const maxDay = Math.max(1, ...d.timeline.map((t) => Math.max(t.works, t.votes)));

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">CONDITION REPORT</p>
        <h1>The collection at a glance</h1>
        <p className="lede">
          Afternoon, {name}. Everything below is read through the same row-level
          security the public site uses — a panel that renders is a panel the
          database agreed to hand over.
        </p>
      </header>

      {/* ---- the ledger ---- */}
      <section className="panel">
        <h2>The ledger</h2>
        <div className="figures">
          <Figure n={d.ledger.works} label="works" sub={`${d.ledger.acquired} acquired`} />
          <Figure n={d.ledger.votes} label="votes cast" sub={`${d.ledger.upvotes} up · ${d.ledger.downvotes} down`} />
          <Figure n={d.ledger.members} label="members" sub={`${d.ledger.curators} curator${d.ledger.curators === 1 ? "" : "s"}`} />
          <Figure n={d.ledger.daysOpen} label="days open" sub="with a closing record" />
          <Figure n={d.ledger.seats} label="café seats taken" sub="all time" />
          <Figure
            n={d.ledger.houseWorks}
            label="house commissions"
            sub={`${d.ledger.memberWorks} from members`}
          />
        </div>
      </section>

      {/* ---- funnel ---- */}
      <section className="panel">
        <h2>Hung, judged, acquired</h2>
        <p className="panel-note">
          The gap between the first two bars is the one that matters: work
          nobody voted on is work the museum never formed an opinion about.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Department</th>
              <th>Hung</th>
              <th>Judged</th>
              <th>Acquired</th>
              <th>Avg score</th>
              <th className="col-wide">Shape</th>
            </tr>
          </thead>
          <tbody>
            {d.funnel.map((f) => (
              <tr key={f.department}>
                <td className="mono">{f.department}</td>
                <td>{f.hung}</td>
                <td>
                  {f.voted}
                  <span className="muted"> ({f.hung ? pct(f.voted / f.hung) : "—"})</span>
                </td>
                <td>{f.acquired}</td>
                <td className="mono">{fixed(f.avgScore)}</td>
                <td className="col-wide">
                  <Bars
                    rows={[
                      { v: f.hung, max: maxBar, tone: "ink" },
                      { v: f.voted, max: maxBar, tone: "mid" },
                      { v: f.acquired, max: maxBar, tone: "signal" },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {d.funnel.length === 0 && <Empty cols={6} />}
          </tbody>
        </table>
      </section>

      {/* ---- house vs membership ---- */}
      <section className="panel panel-split">
        <div>
          <h2>The house against the membership</h2>
          <p className="panel-note">
            The museum commissions one work per department every night. The
            question this answers is whether its own taste beats the people
            voting on it.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Origin</th>
                <th>Works</th>
                <th>Acquired</th>
                <th>Win rate</th>
                <th>Avg score</th>
              </tr>
            </thead>
            <tbody>
              {d.origins.map((o) => (
                <tr key={o.origin}>
                  <td className="mono">{o.origin === "house" ? "the museum" : "members"}</td>
                  <td>{o.works}</td>
                  <td>{o.acquired}</td>
                  <td className="mono">{o.works ? pct(o.winRate) : "—"}</td>
                  <td className="mono">{fixed(o.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>How days ended</h2>
          <p className="panel-note">
            Quiet days are recorded, not skipped. A museum&apos;s history
            includes the weeks nobody came.
          </p>
          <ul className="tally">
            {d.outcomes.map((o) => (
              <li key={o.outcome}>
                <span className={`chip chip-${o.outcome}`}>{o.outcome.replace(/_/g, " ")}</span>
                <strong>{o.days}</strong>
              </li>
            ))}
            {d.outcomes.length === 0 && <li className="muted">No day has closed yet.</li>}
          </ul>
        </div>
      </section>

      {/* ---- divisive ---- */}
      <section className="panel">
        <h2>The works nobody could agree on</h2>
        <p className="panel-note">
          Ranked by turnout discounted by margin — a lot of votes and a score
          near zero. A leaderboard only ever shows you consensus; this shows
          you argument.
        </p>
        <ul className="divisive">
          {d.divisive.map((w) => (
            <li key={w.id}>
              <p className="divisive-meta mono">
                #{w.id} · {w.department} · {w.school} · {w.origin}
              </p>
              <blockquote>{w.body ?? w.title ?? "(visual work)"}</blockquote>
              <p className="divisive-tally mono">
                {fixed(w.score)} from {w.vote_count} votes
              </p>
            </li>
          ))}
          {d.divisive.length === 0 && (
            <li className="muted">
              Nothing has drawn two or more votes yet.
            </li>
          )}
        </ul>
      </section>

      {/* ---- standings ---- */}
      <section className="panel">
        <h2>School standings</h2>
        <p className="panel-note">
          Twenty-four schools across four departments, ordered by average
          score. Which voice the membership actually rewards.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>School</th>
              <th>Department</th>
              <th>Works</th>
              <th>Acquired</th>
              <th>Win rate</th>
              <th>Avg score</th>
            </tr>
          </thead>
          <tbody>
            {d.standings.map((s) => (
              <tr key={`${s.department}-${s.school}`}>
                <td className="mono">{s.school}</td>
                <td className="muted mono">{s.department}</td>
                <td>{s.works}</td>
                <td>{s.acquired}</td>
                <td className="mono">{s.works ? pct(s.winRate) : "—"}</td>
                <td className="mono">{fixed(s.avgScore)}</td>
              </tr>
            ))}
            {d.standings.length === 0 && <Empty cols={6} />}
          </tbody>
        </table>
      </section>

      {/* ---- timeline + cafe ---- */}
      <section className="panel panel-split">
        <div>
          <h2>Last fortnight</h2>
          <table className="data">
            <thead>
              <tr><th>Day</th><th>Works</th><th>Votes</th><th className="col-wide">&nbsp;</th></tr>
            </thead>
            <tbody>
              {d.timeline.map((t) => (
                <tr key={t.day}>
                  <td className="mono">{t.day.slice(5)}</td>
                  <td>{t.works}</td>
                  <td>{t.votes}</td>
                  <td className="col-wide">
                    <Bars
                      rows={[
                        { v: t.works, max: maxDay, tone: "ink" },
                        { v: t.votes, max: maxDay, tone: "signal" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {d.timeline.length === 0 && <Empty cols={4} />}
            </tbody>
          </table>
        </div>

        <div>
          <h2>The café, as an atlas</h2>
          <p className="panel-note">Twelve drinks, twelve places.</p>
          <ul className="tally">
            {d.drinks.map((dr) => (
              <li key={dr.name}>
                <span>
                  {dr.name} <span className="muted">· {dr.origin}</span>
                </span>
                <strong>{dr.orders}</strong>
              </li>
            ))}
            {d.drinks.length === 0 && <li className="muted">Nobody has sat down yet.</li>}
          </ul>
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

function Bars({ rows }: { rows: { v: number; max: number; tone: string }[] }) {
  return (
    <span className="bars">
      {rows.map((r, i) => (
        <span
          key={i}
          className={`bar bar-${r.tone}`}
          style={{ width: `${Math.max(2, (r.v / r.max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

function Empty({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="muted" colSpan={cols}>
        Nothing recorded yet.
      </td>
    </tr>
  );
}
