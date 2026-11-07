import type { Entity } from "@/lib/crud";

const DEPARTMENTS = ["humour", "poetry", "prints", "film"] as const;

// Every entity the generic registry screens can render. The permissions
// here are transcribed straight from the brief, and they are enforced in
// three places: the buttons this drives, the server action that checks
// them again, and the RLS policies in migration 010 — which have no
// matching policy at all where this says false.
export const ENTITIES: Entity[] = [
  {
    slug: "llm-providers",
    table: "llm_providers",
    label: "LLM providers",
    singular: "provider",
    blurb:
      "Who the museum generates with. The key itself is never stored here — only the name of the environment variable that holds it, because a secret in a table is a secret in every backup.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "slug",
    ascending: true,
    fields: [
      { name: "slug", label: "Slug", type: "text", required: true, inList: true, mono: true },
      { name: "name", label: "Name", type: "text", required: true, inList: true },
      { name: "api_base", label: "API base", type: "text", mono: true },
      {
        name: "env_key_name",
        label: "Env var holding the key",
        type: "text",
        required: true,
        inList: true,
        mono: true,
        hint: "The NAME of the variable, e.g. GEMINI_API_KEY. Never the key.",
      },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "created_at", label: "Added", type: "text", readOnly: true },
    ],
  },

  {
    slug: "llm-models",
    table: "llm_models",
    label: "LLM models",
    singular: "model",
    blurb:
      "What a prompt chain runs on. max_output_tokens is a cap on thinking AND output together, which is why a poem needs a far larger budget than a one-line joke — set it too low and the model spends the lot reasoning and returns an empty string.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "slug",
    ascending: true,
    fields: [
      {
        name: "provider_id",
        label: "Provider",
        type: "ref",
        required: true,
        inList: true,
        ref: { table: "llm_providers", labelCol: "name" },
      },
      { name: "slug", label: "Model slug", type: "text", required: true, inList: true, mono: true },
      { name: "display_name", label: "Display name", type: "text", required: true, inList: true },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        options: ["text", "image", "video"],
        required: true,
        inList: true,
      },
      {
        name: "max_output_tokens",
        label: "Max output tokens",
        type: "number",
        required: true,
        inList: true,
        mono: true,
        hint: "Thinking and output share this budget.",
      },
      {
        name: "default_temperature",
        label: "Default temperature",
        type: "decimal",
        required: true,
        mono: true,
      },
      { name: "input_cost_per_mtok", label: "Input $/Mtok", type: "decimal", mono: true },
      { name: "output_cost_per_mtok", label: "Output $/Mtok", type: "decimal", mono: true },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  {
    slug: "terms",
    table: "terms",
    label: "Terms",
    singular: "term",
    blurb:
      "The museum's controlled vocabulary. Terms marked for injection are fed into prompts so the model writes \"accessioned\" and \"wing\" rather than inventing its own words, and they double as the glossary behind the wall text.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "term",
    ascending: true,
    fields: [
      { name: "term", label: "Term", type: "text", required: true, inList: true, mono: true },
      { name: "definition", label: "Definition", type: "textarea", required: true, inList: true },
      { name: "usage_note", label: "Usage note", type: "textarea" },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: ["house-style", "department", "material", "process"],
        required: true,
        inList: true,
      },
      {
        name: "inject_into_prompts",
        label: "Inject into prompts",
        type: "boolean",
        inList: true,
        hint: "On: this term and its usage note are appended to every prompt in the chain's vocabulary step.",
      },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
    ],
  },

  {
    slug: "examples",
    table: "ai_generation_examples",
    label: "AI generation examples",
    singular: "example",
    blurb:
      "Few-shot material. A negative example is often the faster correction — showing the model what breaks a school's voice beats describing it.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "id",
    fields: [
      {
        name: "department",
        label: "Department",
        type: "select",
        options: DEPARTMENTS,
        required: true,
        inList: true,
      },
      {
        name: "school",
        label: "School",
        type: "text",
        inList: true,
        mono: true,
        hint: "A school slug such as deadpan or haiku. Leave blank to apply across the department.",
      },
      { name: "label", label: "Label", type: "text", required: true, inList: true },
      {
        name: "example_output",
        label: "Example output",
        type: "textarea",
        required: true,
        hint: "Line breaks are preserved exactly. They are load-bearing in haiku and concrete poetry.",
      },
      {
        name: "polarity",
        label: "Polarity",
        type: "select",
        options: ["positive", "negative"],
        required: true,
        inList: true,
      },
      {
        name: "chain_id",
        label: "Only for chain",
        type: "ref",
        ref: { table: "prompt_chains", labelCol: "slug" },
        hint: "Optional. Blank means any chain serving this department.",
      },
      { name: "sort_order", label: "Sort order", type: "number", mono: true },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  {
    slug: "signup-domains",
    table: "allowed_signup_domains",
    label: "Allowed signup domains",
    singular: "domain",
    blurb:
      "Who may register. Stored bare and lowercase — columbia.edu, not @columbia.edu. The gate fails OPEN while no domain and no individual address is active, so emptying this table opens the museum rather than sealing it.",
    permissionNote:
      "Deactivate gmail.com to see the gate working. The curator's own address is whitelisted individually on the next screen, so tightening this cannot lock you out.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "domain",
    ascending: true,
    fields: [
      {
        name: "domain",
        label: "Domain",
        type: "text",
        required: true,
        inList: true,
        mono: true,
        hint: "Lowercase, no @ and no leading dot.",
      },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
      { name: "note", label: "Note", type: "textarea", inList: true },
      { name: "created_at", label: "Added", type: "text", readOnly: true },
    ],
  },

  {
    slug: "whitelisted-emails",
    table: "whitelisted_emails",
    label: "Whitelisted e-mail addresses",
    singular: "address",
    blurb:
      "Individual exceptions to the domain rule, and the escape hatch that makes tightening the domains safe. An address here gets in even when its domain is not allowed.",
    permissions: { create: true, update: true, delete: true },
    orderBy: "email",
    ascending: true,
    fields: [
      {
        name: "email",
        label: "E-mail",
        type: "text",
        required: true,
        inList: true,
        mono: true,
        hint: "Lowercase. The database rejects anything else.",
      },
      { name: "is_active", label: "Active", type: "boolean", inList: true },
      { name: "note", label: "Note", type: "textarea", inList: true },
      { name: "created_at", label: "Added", type: "text", readOnly: true },
    ],
  },

  {
    slug: "prompt-chains",
    table: "prompt_chains",
    label: "Prompt chains",
    singular: "chain",
    blurb:
      "One recipe for assembling a prompt. Several chains can serve the same department; the mix decides which one a commission draws, so a variant can be introduced at weight 0 and dialled up without a deploy.",
    permissionNote:
      "Read-only, per the brief. Migration 010 grants curators no insert, update or delete policy on this table at all, so a stray write is refused by Postgres and not merely missing from this page.",
    permissions: { create: false, update: false, delete: false },
    orderBy: "slug",
    ascending: true,
    fields: [
      { name: "slug", label: "Slug", type: "text", readOnly: true, inList: true, mono: true },
      { name: "name", label: "Name", type: "text", readOnly: true, inList: true },
      { name: "department", label: "Department", type: "text", readOnly: true, inList: true, mono: true },
      { name: "media", label: "Media", type: "text", readOnly: true, inList: true, mono: true },
      {
        name: "model_id",
        label: "Model",
        type: "ref",
        readOnly: true,
        inList: true,
        ref: { table: "llm_models", labelCol: "slug" },
      },
      { name: "temperature", label: "Temperature", type: "decimal", readOnly: true, inList: true, mono: true },
      {
        name: "max_output_tokens",
        label: "Max output tokens",
        type: "number",
        readOnly: true,
        inList: true,
        mono: true,
      },
      { name: "is_active", label: "Active", type: "boolean", readOnly: true, inList: true },
      { name: "notes", label: "Notes", type: "textarea", readOnly: true },
    ],
  },
];

export function findEntity(slug: string): Entity | undefined {
  return ENTITIES.find((e) => e.slug === slug);
}

// What appears in the nav, in the order the brief lists it.
export const REGISTRY_NAV = [
  "prompt-chains",
  "terms",
  "examples",
  "llm-models",
  "llm-providers",
  "signup-domains",
  "whitelisted-emails",
] as const;
