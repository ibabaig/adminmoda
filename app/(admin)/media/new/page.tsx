import Link from "next/link";
import { requireSuperadmin } from "@/lib/admin-guard";
import { listSchools, DEPARTMENTS } from "@/lib/media";
import { addWork } from "../actions";

export default async function NewWork() {
  const { supabase } = await requireSuperadmin();
  const schools = await listSchools(supabase);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">NEW ACCESSION</p>
        <h1>Hang a work by hand</h1>
        <p className="lede">
          This enters the current wing credited to the museum, marked{" "}
          <span className="mono">model: manual</span> with a prompt that says a
          curator typed it. The alternative — leaving the provenance blank —
          would put a row in the table that looks generated and isn&apos;t.
        </p>
      </header>

      <form action={addWork}>
        <div className="editor">
          <div className="stack">
            <div className="field">
              <label htmlFor="department">Department</label>
              <select id="department" name="department" required defaultValue="humour">
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="school">School</label>
              <select id="school" name="school" required>
                {schools.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.department} — {s.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                The school has to match the department, or the row is a
                contradiction.
              </span>
            </div>

            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" />
            </div>

            <div className="field">
              <label htmlFor="body">Body</label>
              <textarea id="body" name="body" />
              <span className="field-hint">Line breaks are preserved.</span>
            </div>

            <div className="field">
              <label htmlFor="caption">Wall caption</label>
              <input id="caption" name="caption" />
            </div>

            <div className="form-row">
              <button className="btn" type="submit">
                Accession
              </button>
              <Link className="btn btn-ghost" href="/media">
                Cancel
              </Link>
            </div>
          </div>

          <div className="record">
            <p className="divisive-meta">WHAT THE DATABASE WILL ACCEPT</p>
            <p style={{ marginTop: "10px", fontSize: "0.78rem", lineHeight: 1.6 }}>
              The insert policy on <span className="mono">works</span> caps
              members at three commissions a day and refuses rows that credit
              someone else. A curator inserting a house work passes a different
              branch of the same policy. If any of this is wrong the database
              rejects the insert and you will see the error here rather than a
              silent success.
            </p>
          </div>
        </div>
      </form>
    </>
  );
}
