import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/admin-guard";
import { findEntity } from "@/lib/registry";
import { loadRefs } from "@/lib/crud";
import { FieldInput } from "../../fields";
import { createEntityRow } from "../../actions";

export default async function NewEntityRow({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { supabase } = await requireSuperadmin();
  const { entity } = await params;

  const e = findEntity(entity);
  if (!e) notFound();
  // Not merely hidden: this route refuses to render a form the entity
  // does not permit, and the action would refuse the POST anyway.
  if (!e.permissions.create) notFound();

  const refs = await loadRefs(supabase, e);
  const editable = e.fields.filter((f) => !f.readOnly);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link href={`/registry/${e.slug}`}>{e.label.toUpperCase()}</Link> / NEW
        </p>
        <h1>New {e.singular}</h1>
        {e.permissionNote && <p className="lede">{e.permissionNote}</p>}
      </header>

      <form action={createEntityRow.bind(null, e.slug)}>
        <div className="stack form-stack">
          {editable.map((f) => (
            <FieldInput key={f.name} field={f} value={null} refs={refs} />
          ))}
        </div>
        <div className="form-row">
          <button className="btn" type="submit">
            Create
          </button>
          <Link className="btn btn-ghost" href={`/registry/${e.slug}`}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
