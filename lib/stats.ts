import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

// Every figure here is derived from rows the DATABASE agreed to hand
// over. Nothing uses a service-role key, so a panel that renders is a
// panel RLS permitted — which makes the dashboard its own access test.
//
// The dataset is small (a class project), so these pull rows and
// aggregate in TypeScript rather than adding views. At a few thousand
// rows that is the right trade; past that these become SQL views.

export type Ledger = {
  works: number;
  acquired: number;
  houseWorks: number;
  memberWorks: number;
  members: number;
  curators: number;
  votes: number;
  upvotes: number;
  downvotes: number;
  seats: number;
  daysOpen: number;
};

export type DeptFunnel = {
  department: string;
  hung: number;
  voted: number;
  acquired: number;
  avgScore: number;
};

export type SchoolStanding = {
  school: string;
  department: string;
  works: number;
  acquired: number;
  avgScore: number;
  winRate: number;
};

export type Divisive = {
  id: number;
  department: string;
  school: string;
  body: string | null;
  title: string | null;
  score: number;
  vote_count: number;
  origin: string;
};

export type OriginSplit = {
  origin: string;
  works: number;
  acquired: number;
  avgScore: number;
  winRate: number;
};

export type OutcomeTally = { outcome: string; days: number };
export type DrinkTally = { name: string; origin: string; orders: number };
export type DayPoint = { day: string; works: number; votes: number };

export type Dashboard = {
  ledger: Ledger;
  funnel: DeptFunnel[];
  standings: SchoolStanding[];
  divisive: Divisive[];
  origins: OriginSplit[];
  outcomes: OutcomeTally[];
  drinks: DrinkTally[];
  timeline: DayPoint[];
};

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export async function loadDashboard(db: Db): Promise<Dashboard> {
  const [worksRes, votesRes, profilesRes, exhibitionsRes, seatsRes, drinksRes] =
    await Promise.all([
      db.from("works").select(
        "id, department, origin, school, body, title, score, vote_count, accessioned_at, hung_on"
      ),
      db.from("votes").select("id, work_id, value, created_at"),
      db.from("profiles").select("id, is_superadmin"),
      db.from("exhibitions").select("held_on, department, outcome"),
      db.from("cafe_seats").select("id, drink_slug, sat_on"),
      db.from("drinks").select("slug, name, origin"),
    ]);

  const works = worksRes.data ?? [];
  const votes = votesRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const exhibitions = exhibitionsRes.data ?? [];
  const seats = seatsRes.data ?? [];
  const drinks = drinksRes.data ?? [];

  // ---- the ledger -------------------------------------------
  const ledger: Ledger = {
    works: works.length,
    acquired: works.filter((w) => w.accessioned_at).length,
    houseWorks: works.filter((w) => w.origin === "house").length,
    memberWorks: works.filter((w) => w.origin === "member").length,
    members: profiles.length,
    curators: profiles.filter((p) => p.is_superadmin).length,
    votes: votes.length,
    upvotes: votes.filter((v) => v.value === 1).length,
    downvotes: votes.filter((v) => v.value === -1).length,
    seats: seats.length,
    daysOpen: new Set(exhibitions.map((e) => e.held_on)).size,
  };

  // ---- acquisition funnel by department ----------------------
  // Hung -> actually judged -> acquired. The gap between the first two
  // is the interesting one: work nobody voted on is work the museum
  // never got an opinion about.
  const byDept = new Map<string, typeof works>();
  for (const w of works) {
    const list = byDept.get(w.department) ?? [];
    list.push(w);
    byDept.set(w.department, list);
  }

  const funnel: DeptFunnel[] = [...byDept.entries()]
    .map(([department, ws]) => ({
      department,
      hung: ws.length,
      voted: ws.filter((w) => (w.vote_count ?? 0) > 0).length,
      acquired: ws.filter((w) => w.accessioned_at).length,
      avgScore: mean(ws.map((w) => w.score ?? 0)),
    }))
    .sort((a, b) => b.hung - a.hung);

  // ---- school standings, as a league table -------------------
  const bySchool = new Map<string, typeof works>();
  for (const w of works) {
    const list = bySchool.get(w.school) ?? [];
    list.push(w);
    bySchool.set(w.school, list);
  }

  const standings: SchoolStanding[] = [...bySchool.entries()]
    .map(([school, ws]) => {
      const acquired = ws.filter((w) => w.accessioned_at).length;
      return {
        school,
        department: ws[0]?.department ?? "—",
        works: ws.length,
        acquired,
        avgScore: mean(ws.map((w) => w.score ?? 0)),
        winRate: ws.length ? acquired / ws.length : 0,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore || b.works - a.works);

  // ---- the works nobody could agree on -----------------------
  // Lots of votes, a score near zero: the membership turned out AND
  // split. More interesting than a leaderboard, which only ever shows
  // you consensus.
  const divisive: Divisive[] = works
    .filter((w) => (w.vote_count ?? 0) >= 2)
    .map((w) => ({
      id: w.id,
      department: w.department,
      school: w.school,
      body: w.body,
      title: w.title,
      score: w.score ?? 0,
      vote_count: w.vote_count ?? 0,
      origin: w.origin,
      // Controversy: turnout, discounted by how lopsided the result was.
      _c: (w.vote_count ?? 0) - Math.abs(w.score ?? 0) * 1.5,
    }))
    .sort((a, b) => b._c - a._c)
    .slice(0, 5)
    .map(({ _c, ...rest }) => rest);

  // ---- the house against the membership ----------------------
  // The museum commissions one work per department per night. Does its
  // own taste beat the people voting on it?
  const origins: OriginSplit[] = ["house", "member"].map((origin) => {
    const ws = works.filter((w) => w.origin === origin);
    const acquired = ws.filter((w) => w.accessioned_at).length;
    return {
      origin,
      works: ws.length,
      acquired,
      avgScore: mean(ws.map((w) => w.score ?? 0)),
      winRate: ws.length ? acquired / ws.length : 0,
    };
  });

  // ---- how days actually ended -------------------------------
  const outcomeMap = new Map<string, number>();
  for (const e of exhibitions) {
    outcomeMap.set(e.outcome, (outcomeMap.get(e.outcome) ?? 0) + 1);
  }
  const outcomes: OutcomeTally[] = [...outcomeMap.entries()]
    .map(([outcome, days]) => ({ outcome, days }))
    .sort((a, b) => b.days - a.days);

  // ---- the café, as an atlas ---------------------------------
  const drinkMeta = new Map(drinks.map((d) => [d.slug, d]));
  const orderMap = new Map<string, number>();
  for (const s of seats) {
    orderMap.set(s.drink_slug, (orderMap.get(s.drink_slug) ?? 0) + 1);
  }
  const drinkTally: DrinkTally[] = [...orderMap.entries()]
    .map(([slug, orders]) => ({
      name: drinkMeta.get(slug)?.name ?? slug,
      origin: drinkMeta.get(slug)?.origin ?? "—",
      orders,
    }))
    .sort((a, b) => b.orders - a.orders);

  // ---- last fourteen days ------------------------------------
  const dayMap = new Map<string, { works: number; votes: number }>();
  for (const w of works) {
    const d = dayMap.get(w.hung_on) ?? { works: 0, votes: 0 };
    d.works += 1;
    dayMap.set(w.hung_on, d);
  }
  for (const v of votes) {
    const day = String(v.created_at).slice(0, 10);
    const d = dayMap.get(day) ?? { works: 0, votes: 0 };
    d.votes += 1;
    dayMap.set(day, d);
  }
  const timeline: DayPoint[] = [...dayMap.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);

  return {
    ledger,
    funnel,
    standings,
    divisive,
    origins,
    outcomes,
    drinks: drinkTally,
    timeline,
  };
}
