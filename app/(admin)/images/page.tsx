import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { listImages, publicUrl, ALLOWED_TYPES } from "@/lib/images";
import { upload } from "./actions";

const kb = (n: number | null) => (n === null ? "—" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

export default async function Images({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const sp = await searchParams;
  const images = await listImages(supabase);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">THE IMAGE STORE</p>
        <h1>Images</h1>
        <p className="lede">
          Bytes go to Supabase Storage; this table holds the{" "}
          <span className="mono">path</span>. Assignment 3 said it outright —
          binary image data does not belong in a relational column — and it is
          still true. A catalogue row and its file are created and deleted
          together, because a row pointing at nothing is as useless as a file
          nobody can find.
        </p>
      </header>

      {sp.deleted && <p className="notice">Image and file both removed.</p>}

      <section className="panel">
        <h2>Upload</h2>
        <form action={upload} encType="multipart/form-data">
          <div className="upload-grid">
            <div className="field">
              <label htmlFor="file">File</label>
              <input
                id="file"
                name="file"
                type="file"
                required
                accept={ALLOWED_TYPES.join(",")}
              />
              <span className="field-hint">
                PNG, JPEG, WebP, GIF or SVG. 5MB limit.
              </span>
            </div>
            <div className="field">
              <label htmlFor="kind">Kind</label>
              <select id="kind" name="kind" defaultValue="reference">
                <option value="reference">reference</option>
                <option value="icon">icon</option>
                <option value="work">work</option>
                <option value="avatar">avatar</option>
              </select>
              <span className="field-hint">
                Becomes the folder inside the bucket.
              </span>
            </div>
            <div className="field">
              <label htmlFor="alt_text">Alt text</label>
              <input id="alt_text" name="alt_text" />
              <span className="field-hint">
                What it shows, for anyone who cannot see it.
              </span>
            </div>
            <div className="field">
              <label htmlFor="work_id">Attach to work #</label>
              <input id="work_id" name="work_id" type="number" min={1} />
              <span className="field-hint">Optional.</span>
            </div>
            <div className="field upload-wide">
              <label htmlFor="caption">Caption</label>
              <input id="caption" name="caption" />
            </div>
          </div>
          <div className="form-row">
            <button className="btn" type="submit">
              Upload
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>{images.length} in the store</h2>
        {images.length === 0 ? (
          <p className="panel-note">
            Nothing uploaded yet. The icons you wanted to draw for the café go
            here — upload them as kind <span className="mono">icon</span>.
          </p>
        ) : (
          <ul className="gallery">
            {images.map((img) => (
              <li key={img.id}>
                <Link href={`/images/${img.id}`}>
                  <span className="thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(img)} alt={img.alt_text ?? ""} loading="lazy" />
                  </span>
                  <p className="divisive-meta mono">
                    #{img.id} · {img.kind} · {kb(img.byte_size)}
                  </p>
                  <p className="thumb-path mono">{img.path}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
