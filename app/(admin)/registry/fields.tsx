import type { Entity, Field, Row } from "@/lib/crud";

export type RefMap = Record<string, { id: number; label: string }[]>;

// One field, rendered from its descriptor. The same descriptor decides
// whether this is an input at all: a readOnly field renders as a value
// with no name attribute, so there is nothing for the browser to submit
// and nothing for the action to pick up.
export function FieldInput({
  field,
  value,
  refs,
}: {
  field: Field;
  value: unknown;
  refs: RefMap;
}) {
  const id = `f-${field.name}`;
  const str = value === null || value === undefined ? "" : String(value);

  if (field.readOnly) {
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <p className={`readonly-value${field.mono ? " mono" : ""}`}>{str || "—"}</p>
        {field.hint && <span className="field-hint">{field.hint}</span>}
      </div>
    );
  }

  let control: React.ReactNode;

  if (field.type === "textarea") {
    control = (
      <textarea id={id} name={field.name} defaultValue={str} required={field.required} />
    );
  } else if (field.type === "boolean") {
    control = (
      <label className="checkline">
        <input id={id} name={field.name} type="checkbox" defaultChecked={value === true} />
        <span>yes</span>
      </label>
    );
  } else if (field.type === "select") {
    control = (
      <select id={id} name={field.name} defaultValue={str} required={field.required}>
        {!field.required && <option value="">—</option>}
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "ref") {
    const options = refs[field.name] ?? [];
    control = (
      <select id={id} name={field.name} defaultValue={str} required={field.required}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        id={id}
        name={field.name}
        type={field.type === "number" || field.type === "decimal" ? "number" : "text"}
        step={field.type === "decimal" ? "0.01" : undefined}
        defaultValue={str}
        required={field.required}
      />
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="req"> *</span>}
      </label>
      {control}
      {field.hint && <span className="field-hint">{field.hint}</span>}
    </div>
  );
}

// How a value reads in a list cell. Booleans become chips because a
// column of "true"/"false" is harder to scan than a column of marks.
export function Cell({
  field,
  row,
  refs,
}: {
  field: Field;
  row: Row;
  refs: RefMap;
}) {
  const value = row[field.name];

  if (field.type === "boolean") {
    return value ? (
      <span className="chip chip-acquired">yes</span>
    ) : (
      <span className="chip">no</span>
    );
  }

  if (field.type === "ref") {
    const hit = (refs[field.name] ?? []).find((o) => o.id === Number(value));
    return <span className="mono muted">{hit?.label ?? (value === null ? "—" : String(value))}</span>;
  }

  if (value === null || value === undefined || value === "") {
    return <span className="muted">—</span>;
  }

  const text = String(value);
  const clipped = text.length > 90 ? `${text.replace(/\s+/g, " ").slice(0, 90)}…` : text;
  return <span className={field.mono ? "mono" : undefined}>{clipped}</span>;
}

export const listFields = (e: Entity) => e.fields.filter((f) => f.inList);
