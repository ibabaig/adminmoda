import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { ENTITIES, REGISTRY_NAV } from "@/lib/registry";

const ordered = REGISTRY_NAV.map((s) => ENTITIES.find((e) => e.slug === s)!).filter(Boolean);

function perms(p: { create: boolean; update: boolean; delete: boolean }) {
  const ops = ["read"];
  if (p.create) ops.unshift("create");
  if (p.update) ops.push("update");
  if (p.delete) ops.push("delete");
  return ops.join(" · ");
}

export default async function RegistryIndex() {
  await requireSuperadmin();

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">THE REGISTRY</p>
        <h1>How the museum generates</h1>
        <p className="lede">
          The pipeline used to live in <span className="mono">lib/gemini.ts</span>,
          with the model name in an environment variable and no record of
          what happened when a commission was attempted. It lives here now.
          Each table below says which operations it permits — and where it
          says read only, the database has no write policy at all, so a
          stray write is refused rather than merely absent from the page.
        </p>
      </header>

      <div className="cards">
        {ordered.map((e) => (
          <Link key={e.slug} className="card" href={`/registry/${e.slug}`}>
            <p className="card-perms mono">{perms(e.permissions)}</p>
            <h2>{e.label}</h2>
            <p className="card-blurb">{e.blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
