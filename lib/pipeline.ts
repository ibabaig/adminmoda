import type { Db } from "@/lib/crud";

// ---------------------------------------------------------------
// CHAINS, STEPS AND THE MIX
// ---------------------------------------------------------------

export type ChainStep = {
  id: number;
  step_order: number;
  role: string;
  label: string;
  template: string;
  is_active: boolean;
};

export type ChainWithSteps = {
  id: number;
  slug: string;
  name: string;
  department: string;
  media: string;
  temperature: number | null;
  max_output_tokens: number | null;
  is_active: boolean;
  notes: string | null;
  modelSlug: string | null;
  steps: ChainStep[];
  mixId: number | null;
  weight: number;
  mixActive: boolean;
  // Share of its department's traffic, which is what a weight actually
  // means. A weight of 100 is meaningless on its own.
  share: number;
};

export async function loadChains(db: Db): Promise<ChainWithSteps[]> {
  const [chainsRes, stepsRes, mixRes, modelsRes] = await Promise.all([
    db
      .from("prompt_chains")
      .select(
        "id, slug, name, department, media, temperature, max_output_tokens, is_active, notes, model_id"
      )
      .order("department")
      .order("slug"),
    db
      .from("prompt_chain_steps")
      .select("id, chain_id, step_order, role, label, template, is_active")
      .order("step_order"),
    db.from("prompt_chain_mix").select("id, chain_id, department, weight, is_active"),
    db.from("llm_models").select("id, slug"),
  ]);

  if (chainsRes.error) throw new Error(`Could not load chains: ${chainsRes.error.message}`);

  type RawChain = {
    id: number;
    slug: string;
    name: string;
    department: string;
    media: string;
    temperature: number | null;
    max_output_tokens: number | null;
    is_active: boolean;
    notes: string | null;
    model_id: number | null;
  };

  const chains = (chainsRes.data ?? []) as unknown as RawChain[];
  const steps = (stepsRes.data ?? []) as unknown as (ChainStep & { chain_id: number })[];
  const mix = (mixRes.data ?? []) as unknown as {
    id: number;
    chain_id: number;
    department: string;
    weight: number;
    is_active: boolean;
  }[];
  const models = new Map(
    ((modelsRes.data ?? []) as unknown as { id: number; slug: string }[]).map((m) => [
      m.id,
      m.slug,
    ])
  );

  // Department totals, so a weight can be shown as the share it really is.
  const deptTotal = new Map<string, number>();
  for (const m of mix) {
    if (!m.is_active) continue;
    deptTotal.set(m.department, (deptTotal.get(m.department) ?? 0) + m.weight);
  }

  return chains.map((c) => {
    const row = mix.find((m) => m.chain_id === c.id);
    const total = deptTotal.get(c.department) ?? 0;
    const weight = row?.weight ?? 0;
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      department: c.department,
      media: c.media,
      temperature: c.temperature,
      max_output_tokens: c.max_output_tokens,
      is_active: c.is_active,
      notes: c.notes,
      modelSlug: c.model_id ? models.get(c.model_id) ?? null : null,
      mixId: row?.id ?? null,
      weight,
      mixActive: row?.is_active ?? false,
      share: total > 0 && (row?.is_active ?? false) ? weight / total : 0,
    };
  }).map((c) => ({
    ...c,
    steps: steps
      .filter((s) => s.chain_id === c.id)
      .sort((a, b) => a.step_order - b.step_order),
  }));
}

// ---------------------------------------------------------------
// WHAT ACTUALLY HAPPENED
// ---------------------------------------------------------------

export type RequestRow = {
  id: number;
  created_at: string;
  origin: string;
  department: string;
  school: string | null;
  status: string;
  failure_reason: string | null;
  duration_ms: number | null;
  work_id: number | null;
  requesterName: string;
  chainSlug: string | null;
  modelSlug: string | null;
  finishReason: string | null;
  sanitiserOk: boolean | null;
  sanitiserReason: string | null;
  totalTokens: number | null;
  thoughtTokens: number | null;
};

export type ResponseRow = {
  id: number;
  request_id: number;
  finish_reason: string | null;
  prompt_tokens: number | null;
  thought_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  was_sanitised: boolean;
  sanitiser_ok: boolean | null;
  sanitiser_reason: string | null;
  raw_text: string | null;
  created_at: string;
};

const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  // Nearest-rank. With a handful of samples anything cleverer is
  // precision the data has not earned.
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export type DeptMetric = {
  department: string;
  attempts: number;
  succeeded: number;
  failed: number;
  pending: number;
  successRate: number;
  p50: number | null;
  p95: number | null;
};

export type PipelineMetrics = {
  attempts: number;
  succeeded: number;
  failed: number;
  pending: number;
  successRate: number;
  p50: number | null;
  p95: number | null;
  byDepartment: DeptMetric[];
  finishReasons: { reason: string; n: number }[];
  sanitiser: { checked: number; rejected: number; rate: number; reasons: { reason: string; n: number }[] };
  failures: { reason: string; n: number }[];
};

export async function loadPipeline(
  db: Db,
  limit = 300
): Promise<{ requests: RequestRow[]; responses: ResponseRow[]; metrics: PipelineMetrics }> {
  const [reqRes, respRes, peopleRes, chainsRes, modelsRes] = await Promise.all([
    db
      .from("generation_requests")
      .select(
        "id, requester_id, origin, department, school, status, failure_reason, duration_ms, work_id, chain_id, model_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("llm_responses")
      .select(
        "id, request_id, model_id, finish_reason, prompt_tokens, thought_tokens, output_tokens, total_tokens, duration_ms, was_sanitised, sanitiser_ok, sanitiser_reason, raw_text, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    db.from("profiles").select("id, first_name, last_name, email"),
    db.from("prompt_chains").select("id, slug"),
    db.from("llm_models").select("id, slug"),
  ]);

  if (reqRes.error) throw new Error(`Could not load generation requests: ${reqRes.error.message}`);

  type RawReq = {
    id: number;
    requester_id: string | null;
    origin: string;
    department: string;
    school: string | null;
    status: string;
    failure_reason: string | null;
    duration_ms: number | null;
    work_id: number | null;
    chain_id: number | null;
    model_id: number | null;
    created_at: string;
  };

  const raw = (reqRes.data ?? []) as unknown as RawReq[];
  const responses = (respRes.data ?? []) as unknown as ResponseRow[];

  const people = new Map(
    (
      (peopleRes.data ?? []) as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "a member",
    ])
  );
  const chains = new Map(
    ((chainsRes.data ?? []) as unknown as { id: number; slug: string }[]).map((c) => [c.id, c.slug])
  );
  const models = new Map(
    ((modelsRes.data ?? []) as unknown as { id: number; slug: string }[]).map((m) => [m.id, m.slug])
  );
  const byRequest = new Map(responses.map((r) => [r.request_id, r]));

  const requests: RequestRow[] = raw.map((r) => {
    const resp = byRequest.get(r.id);
    return {
      id: r.id,
      created_at: r.created_at,
      origin: r.origin,
      department: r.department,
      school: r.school,
      status: r.status,
      failure_reason: r.failure_reason,
      duration_ms: r.duration_ms,
      work_id: r.work_id,
      requesterName: r.requester_id ? people.get(r.requester_id) ?? "a former member" : "the Museum",
      chainSlug: r.chain_id ? chains.get(r.chain_id) ?? null : null,
      modelSlug: r.model_id ? models.get(r.model_id) ?? null : null,
      finishReason: resp?.finish_reason ?? null,
      sanitiserOk: resp?.sanitiser_ok ?? null,
      sanitiserReason: resp?.sanitiser_reason ?? null,
      totalTokens: resp?.total_tokens ?? null,
      thoughtTokens: resp?.thought_tokens ?? null,
    };
  });

  // ---- metrics ------------------------------------------------
  const durations = requests
    .map((r) => r.duration_ms)
    .filter((d): d is number => typeof d === "number" && d > 0);

  const tally = (xs: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const x of xs) {
      if (!x) continue;
      m.set(x, (m.get(x) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([reason, n]) => ({ reason, n }))
      .sort((a, b) => b.n - a.n);
  };

  const depts = [...new Set(requests.map((r) => r.department))].sort();
  const byDepartment: DeptMetric[] = depts.map((department) => {
    const rs = requests.filter((r) => r.department === department);
    const ok = rs.filter((r) => r.status === "succeeded").length;
    const ds = rs
      .map((r) => r.duration_ms)
      .filter((d): d is number => typeof d === "number" && d > 0);
    return {
      department,
      attempts: rs.length,
      succeeded: ok,
      failed: rs.filter((r) => r.status === "failed").length,
      pending: rs.filter((r) => r.status === "pending").length,
      successRate: rs.length ? ok / rs.length : 0,
      p50: pct(ds, 50),
      p95: pct(ds, 95),
    };
  });

  const checked = responses.filter((r) => r.was_sanitised);
  const rejected = checked.filter((r) => r.sanitiser_ok === false);

  const succeeded = requests.filter((r) => r.status === "succeeded").length;

  return {
    requests,
    responses,
    metrics: {
      attempts: requests.length,
      succeeded,
      failed: requests.filter((r) => r.status === "failed").length,
      pending: requests.filter((r) => r.status === "pending").length,
      successRate: requests.length ? succeeded / requests.length : 0,
      p50: pct(durations, 50),
      p95: pct(durations, 95),
      byDepartment,
      finishReasons: tally(responses.map((r) => r.finish_reason)),
      sanitiser: {
        checked: checked.length,
        rejected: rejected.length,
        rate: checked.length ? rejected.length / checked.length : 0,
        reasons: tally(rejected.map((r) => r.sanitiser_reason)),
      },
      failures: tally(requests.map((r) => r.failure_reason)),
    },
  };
}

// ---------------------------------------------------------------
// THE MIX
// ---------------------------------------------------------------

// Read/update only, which is the honest shape: a mix row exists because
// a chain exists, created by a trigger and removed by the cascade. The
// only thing a curator ever needs to change is the weight, and the
// column-level grant in 010 means that is the only thing an UPDATE
// reaching this table is permitted to touch.
export async function retuneMix(
  db: Db,
  mixId: number,
  weight: number,
  isActive: boolean
) {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error("A weight has to be zero or a positive whole number.");
  }
  const { error } = await db
    .from("prompt_chain_mix")
    .update({
      weight: Math.trunc(weight),
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mixId);

  if (error) throw new Error(`Could not retune the mix: ${error.message}`);
}
