import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { findEntity } from "@/lib/registry";
import { listRows, loadRefs } from "@/lib/crud";
import { Cell, listFields } from "../fields";

export default async function EntityList({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { entity } = await params;
  const sp = await searchParams;

  const e = findEntity(entity);
  if (!e) notFound();

  const [rows, refs] = await Promise.all([listRows(supabase, e), loadRefs(supabase, e)]);
  const cols = listFields(e);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link href="/registry">REGISTRY</Link> / {e.label.toUpperCase()}
        </p>
        <h1>{e.label}</h1>
        <p className="lede">{e.blurb}</p>
      </header>

      {sp.deleted && <p className="notice">Deleted.</p>}

      {!e.permissions.create && e.permissionNote && (
        <p className="notice notice-quiet">{e.permissionNote}</p>
      )}

      <div className="filters">
        <p className="panel-note" style={{ margin: 0, flex: 1 }}>
          {rows.length} row{rows.length === 1 ? "" : "s"}.
        </p>
        {e.permissions.create && (
          <Link className="btn" href={`/registry/${e.slug}/new`}>
            New {e.singular}
          </Link>
        )}
      </div>

      <div className="scroller">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              {cols.map((f) => (
                <th key={f.name}>{f.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono muted">{r.id}</td>
                {cols.map((f) => (
                  <td key={f.name}>
                    <Cell field={f} row={r} refs={refs} />
                  </td>
                ))}
                <td>
                  <Link href={`/registry/${e.slug}/${r.id}`}>
                    {e.permissions.update ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="muted" colSpan={cols.length + 2}>
                  Nothing here yet.
                  {e.permissions.create
                    ? ` Use "New ${e.singular}" to add the first one.`
                    : " This table is populated by migration 010."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
