import { requireSuperadmin } from "@/lib/admin-guard";
import AdminNav from "./nav";

// Everything inside this route group is gated. /login, /denied and
// /auth/* sit outside it, which is why the guard can live here without
// locking people out of the door they came in through.
//
// This layout runs the guard AND every page inside it runs the guard
// again. That is on purpose: a layout is not a security boundary (a
// server action posts straight to its own route), so the real checks
// are the per-page one and, underneath it, RLS.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { name, email } = await requireSuperadmin();

  return (
    <div className="shell">
      <header className="masthead">
        <p className="wordmark">
          MoDA <span>/</span> Registrar&apos;s Office
        </p>
        <div className="who">
          <span>{name}</span>
          {email && <span className="muted">{email}</span>}
          <form action="/auth/signout" method="post">
            <button type="submit" className="linkish">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <AdminNav />
      <main>{children}</main>
    </div>
  );
}
