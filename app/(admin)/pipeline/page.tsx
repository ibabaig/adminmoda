import { requireSuperadmin } from "@/lib/admin-guard";
import { loadChains, type ChainWithSteps } from "@/lib/pipeline";
import { retune } from "./actions";

const DEPARTMENTS = ["humour", "poetry", "prints", "film"] as const;

export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ retuned?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const sp = await searchParams;
  const chains = await loadChains(supabase);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">THE PIPELINE</p>
        <h1>Prompt chains, steps and the mix</h1>
        <p className="lede">
          A chain is one recipe for assembling a prompt. Several can serve the
          same department, and the mix decides which one a commission draws —
          so a variant goes in at weight 0 and gets dialled up without a
          deploy. Chains and their steps are read-only here; the weights are
          the one thing a curator turns.
        </p>
      </header>

      {sp.retuned && (
        <p className="notice">
          Mix updated. The next commission in that department draws on the new
          weights.
        </p>
      )}

      {DEPARTMENTS.map((dept) => {
        const inDept = chains.filter((c) => c.department === dept);
        if (inDept.length === 0) return null;
        return (
          <section className="panel" key={dept}>
            <h2>{dept}</h2>
            <p className="panel-note">
              {inDept.length} chain{inDept.length === 1 ? "" : "s"}. Share is
              what a weight actually means — a weight of 100 says nothing on
              its own, only 100 against everything else active here.
            </p>
            <div className="stack">
              {inDept.map((c) => (
                <ChainCard key={c.id} chain={c} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function ChainCard({ chain: c }: { chain: ChainWithSteps }) {
  const live = c.is_active && c.mixActive && c.weight > 0;

  return (
    <article className={`chain${live ? " chain-live" : ""}`}>
      <header className="chain-head">
        <div>
          <p className="divisive-meta mono">
            {c.slug} · {c.media} · {c.modelSlug ?? "no model"} · temp{" "}
            {c.temperature ?? "default"} · {c.max_output_tokens ?? "default"} tok
          </p>
          <h3>{c.name}</h3>
        </div>
        <div className="chain-share">
          <strong>{Math.round(c.share * 100)}%</strong>
          <span>of traffic</span>
        </div>
      </header>

      {c.notes && <p className="chain-notes">{c.notes}</p>}

      {!live && (
        <p className="chain-dormant mono">
          DORMANT — {!c.is_active
            ? "the chain itself is inactive"
            : !c.mixActive
              ? "its mix row is switched off"
              : "its weight is 0"}
        </p>
      )}

      <ol className="steps">
        {c.steps.map((s) => (
          <li key={s.id} className={s.is_active ? undefined : "step-off"}>
            <p className="step-head mono">
              {s.step_order}. {s.role} — {s.label}
              {!s.is_active && " (inactive)"}
            </p>
            {/* Templates carry real newlines and {{placeholders}}. Both
                matter, so this renders verbatim rather than reflowed. */}
            <pre className="step-template">{s.template}</pre>
          </li>
        ))}
        {c.steps.length === 0 && (
          <li className="muted">No steps. This chain would produce an empty prompt.</li>
        )}
      </ol>

      {c.mixId !== null ? (
        <form action={retune} className="mix-form">
          <input type="hidden" name="mixId" value={c.mixId} />
          <div className="field field-tight">
            <label htmlFor={`w-${c.mixId}`}>Weight</label>
            <input
              id={`w-${c.mixId}`}
              name="weight"
              type="number"
              min={0}
              step={1}
              defaultValue={c.weight}
            />
          </div>
          <label className="checkline">
            <input name="is_active" type="checkbox" defaultChecked={c.mixActive} />
            <span>in the mix</span>
          </label>
          <button className="btn btn-ghost" type="submit">
            Retune
          </button>
        </form>
      ) : (
        <p className="muted mono">
          No mix row — the trigger creates one per chain, so this is a
          migration that did not finish.
        </p>
      )}
    </article>
  );
}
