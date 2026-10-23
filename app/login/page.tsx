import GoogleButton from "./google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="gate">
      <p className="eyebrow">MUSEUM OF DIGITAL ART</p>
      <h1>Back of house</h1>
      <p className="gate-copy">
        Collection management, membership records and the ratings ledger.
        Restricted to curators.
      </p>
      <GoogleButton next={next} />
      {error && (
        <p className="alert" role="alert">
          Sign-in didn&apos;t complete. Check that this app&apos;s callback URL is
          on the Supabase redirect allow list, then try again.
        </p>
      )}
    </main>
  );
}
