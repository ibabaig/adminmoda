import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { getImage, publicUrl } from "@/lib/images";
import { remove, save } from "../actions";

export default async function ImageRecord({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { id } = await params;
  const sp = await searchParams;

  const imageId = Number(id);
  if (!Number.isInteger(imageId)) notFound();

  const img = await getImage(supabase, imageId);
  if (!img) notFound();

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link href="/images">IMAGES</Link> / #{img.id}
        </p>
        <h1>{img.kind}</h1>
      </header>

      {sp.created && <p className="notice">Uploaded and catalogued.</p>}
      {sp.saved && <p className="notice">Saved.</p>}

      <div className="editor">
        <form action={save}>
          <input type="hidden" name="id" value={img.id} />
          <div className="stack form-stack">
            <div className="field">
              <label htmlFor="kind">Kind</label>
              <select id="kind" name="kind" defaultValue={img.kind}>
                <option value="reference">reference</option>
                <option value="icon">icon</option>
                <option value="work">work</option>
                <option value="avatar">avatar</option>
              </select>
              <span className="field-hint">
                Changing this does not move the file; the path is fixed at
                upload.
              </span>
            </div>
            <div className="field">
              <label htmlFor="alt_text">Alt text</label>
              <input id="alt_text" name="alt_text" defaultValue={img.alt_text ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="caption">Caption</label>
              <input id="caption" name="caption" defaultValue={img.caption ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="work_id">Attached to work #</label>
              <input
                id="work_id"
                name="work_id"
                type="number"
                min={1}
                defaultValue={img.work_id ?? ""}
              />
            </div>
          </div>
          <div className="form-row">
            <button className="btn" type="submit">
              Save changes
            </button>
            <Link className="btn btn-ghost" href="/images">
              Back to the store
            </Link>
          </div>
        </form>

        <div className="stack">
          <div className="record">
            <p className="divisive-meta">THE FILE</p>
            <span className="thumb thumb-large">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicUrl(img)} alt={img.alt_text ?? `Image ${img.id}`} />
            </span>
            <dl style={{ marginTop: "14px" }}>
              <dt>Bucket</dt>
              <dd className="mono">{img.bucket}</dd>
              <dt>Path</dt>
              <dd className="mono">{img.path}</dd>
              <dt>Type</dt>
              <dd className="mono">{img.content_type ?? "—"}</dd>
              <dt>Size</dt>
              <dd className="mono">
                {img.byte_size ? `${Math.round(img.byte_size / 1024)}KB` : "—"}
              </dd>
              <dt>Uploaded</dt>
              <dd className="mono">{img.created_at.slice(0, 16).replace("T", " ")}</dd>
            </dl>
          </div>

          <form action={remove}>
            <input type="hidden" name="id" value={img.id} />
            <div className="record" style={{ background: "#fbe9e8" }}>
              <p className="divisive-meta">DELETE</p>
              <p style={{ marginTop: "8px", fontSize: "0.78rem" }}>
                Removes the file from Storage and then the catalogue row. The
                file goes first, so a failure leaves a row pointing at
                something that still exists rather than a file nobody can
                reach.
              </p>
              <button className="btn btn-danger" type="submit" style={{ marginTop: "14px" }}>
                Delete image #{img.id}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
