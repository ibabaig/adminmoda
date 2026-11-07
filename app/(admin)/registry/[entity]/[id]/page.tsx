import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { findEntity } from "@/lib/registry";
import { getRow, loadRefs } from "@/lib/crud";
import { FieldInput } from "../../fields";
import { deleteEntityRow, updateEntityRow } from "../../actions";

export default async function EntityRecord({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { entity, id } = await params;
  const sp = await searchParams;

  const e = findEntity(entity);
  if (!e) notFound();

  const rowId = Number(id);
  if (!Number.isInteger(rowId)) notFound();

  const [row, refs] = await Promise.all([
    getRow(supabase, e, rowId),
    loadRefs(supabase, e),
  ]);
  if (!row) notFound();

  const editable = e.permissions.update;

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link href={`/registry/${e.slug}`}>{e.label.toUpperCase()}</Link> / #{row.id}
        </p>
        <h1>
          {editable ? "Edit" : ""} {e.singular}
        </h1>
        {!editable && e.permissionNote && <p className="lede">{e.permissionNote}</p>}
      </header>

      {sp.created && <p className="notice">Created.</p>}
      {sp.saved && <p className="notice">Saved.</p>}

      {editable ? (
        <form action={updateEntityRow.bind(null, e.slug)}>
          <input type="hidden" name="id" value={row.id} />
          <div className="stack form-stack">
            {e.fields.map((f) => (
              <FieldInput key={f.name} field={f} value={row[f.name]} refs={refs} />
            ))}
          </div>
          <div className="form-row">
            <button className="btn" type="submit">
              Save changes
            </button>
            <Link className="btn btn-ghost" href={`/registry/${e.slug}`}>
              Back
            </Link>
          </div>
        </form>
      ) : (
        <>
          <div className="stack form-stack">
            {e.fields.map((f) => (
              <FieldInput
                key={f.name}
                // Forced read-only regardless of the field's own setting,
                // because the entity itself is.
                field={{ ...f, readOnly: true }}
                value={row[f.name]}
                refs={refs}
              />
            ))}
          </div>
          <div className="form-row">
            <Link className="btn btn-ghost" href={`/registry/${e.slug}`}>
              Back
            </Link>
          </div>
        </>
      )}

      {e.permissions.delete && (
        <form action={deleteEntityRow.bind(null, e.slug)} style={{ marginTop: "40px" }}>
          <input type="hidden" name="id" value={row.id} />
          <div className="record" style={{ background: "#fbe9e8", maxWidth: "460px" }}>
            <p className="divisive-meta">DELETE</p>
            <p style={{ marginTop: "8px", fontSize: "0.78rem" }}>
              Removes this {e.singular} permanently. Anything referencing it by
              foreign key is detached rather than deleted.
            </p>
            <button className="btn btn-danger" type="submit" style={{ marginTop: "14px" }}>
              Delete #{row.id}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
