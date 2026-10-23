import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { getWork } from "@/lib/media";
import { saveWork, removeWork } from "../actions";

export default async function EditWork({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const sp = await searchParams;

  const workId = Number(id);
  if (!Number.isInteger(workId)) notFound();

  const w = await getWork(supabase, workId);
  if (!w) notFound();

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">WORK #{w.id}</p>
        <h1>{w.department} · {w.school}</h1>
      </header>

      {sp.created && <p className="notice">Accessioned. It is hanging in today&apos;s gallery.</p>}
      {sp.saved && <p className="notice">Saved.</p>}

      <div className="editor">
        <form action={saveWork}>
          <input type="hidden" name="id" value={w.id} />

          <div className="stack">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" defaultValue={w.title ?? ""} />
              <span className="field-hint">
                Visual works carry a title; written ones usually do not.
              </span>
            </div>

            <div className="field">
              <label htmlFor="body">Body</label>
              {/* A plain textarea, so line breaks survive. The poetry
                  department depends on them — the public gallery renders
                  this with white-space: pre-line. */}
              <textarea id="body" name="body" defaultValue={w.body ?? ""} />
              <span className="field-hint">
                Line breaks are preserved exactly as typed.
              </span>
            </div>

            <div className="field">
              <label htmlFor="caption">Wall caption</label>
              <input id="caption" name="caption" defaultValue={w.caption ?? ""} />
            </div>
          </div>

          <div className="form-row">
            <button className="btn" type="submit">
              Save changes
            </button>
            <Link className="btn btn-ghost" href="/media">
              Back to the register
            </Link>
          </div>
        </form>

        <div className="stack">
          <div className="record">
            <dl>
              <dt>Department</dt>
              <dd className="mono">{w.department}</dd>
              <dt>School</dt>
              <dd className="mono">{w.school}</dd>
              <dt>Origin</dt>
              <dd className="mono">{w.origin === "house" ? "the museum" : "a member"}</dd>
              <dt>Credit</dt>
              <dd>{w.credit_name ?? "—"}</dd>
              <dt>Model</dt>
              <dd className="mono">{w.model}</dd>
              <dt>Score</dt>
              <dd className="mono">
                {w.score > 0 ? `+${w.score}` : w.score} from {w.vote_count} votes
              </dd>
              <dt>Hung on</dt>
              <dd className="mono">{w.hung_on}</dd>
              <dt>Acquired</dt>
              <dd className="mono">{w.accessioned_at ? w.accessioned_at.slice(0, 10) : "not yet"}</dd>
              <dt>Wing</dt>
              <dd className="mono">{w.wing_id}</dd>
            </dl>
          </div>

          <div className="record">
            <p className="divisive-meta">THE PROMPT THAT PRODUCED IT</p>
            <p style={{ marginTop: "10px", fontSize: "0.78rem", whiteSpace: "pre-wrap" }}>
              {w.prompt}
            </p>
          </div>

          {w.svg_source && (
            <div className="record">
              <p className="divisive-meta">DRAWN OUTPUT</p>
              {/* Rendered through a data: URI in an <img>, never
                  dangerouslySetInnerHTML — this markup came out of a
                  language model and the sanitiser in the public app is
                  the first of two defences, not the only one. */}
              <img
                alt={w.title ?? `Work ${w.id}`}
                src={`data:image/svg+xml;utf8,${encodeURIComponent(w.svg_source)}`}
                style={{ width: "100%", marginTop: "10px", border: "1px solid var(--ink)" }}
              />
            </div>
          )}

          <form action={removeWork}>
            <input type="hidden" name="id" value={w.id} />
            <div className="record" style={{ background: "#fbe9e8" }}>
              <p className="divisive-meta">DEACCESSION</p>
              <p style={{ marginTop: "8px", fontSize: "0.78rem" }}>
                Removes the work and, by cascade, every vote cast on it. There
                is no undo.
              </p>
              <button className="btn btn-danger" type="submit" style={{ marginTop: "14px" }}>
                Delete work #{w.id}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
