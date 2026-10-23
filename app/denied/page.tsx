import { createClient } from "@/lib/supabase/server";

// Signed in, not a superadmin. Reached through the proxy, which is why
// /denied is on the public allowlist — otherwise refusing someone would
// redirect them to the page that refuses them, forever.
export default async function DeniedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? null;

  return (
    <main className="gate">
      <p className="eyebrow">ACCESS REFUSED</p>
      <h1>Not a curator</h1>
      <p className="gate-copy">
        {email ? (
          <>
            You&apos;re signed in as <strong>{email}</strong>, but that account
            doesn&apos;t carry curator access.
          </>
        ) : (
          <>That account doesn&apos;t carry curator access.</>
        )}
      </p>
      <p className="gate-note">
        This is the expected first run. Signing in created your profile row;
        promoting it to a curator has to happen at the database, outside this
        app — see <code>supabase/009_admin_access.sql</code>, section 4.
      </p>
      <form action="/auth/signout" method="post">
        <button className="btn" type="submit">Sign out</button>
      </form>
    </main>
  );
}
