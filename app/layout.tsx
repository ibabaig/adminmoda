import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoDA — Admin's Office",
  description: "Administration for the Museum of Digital Archives.",
  // Nothing here should ever be indexed. The login wall is the real
  // protection; this is just not inviting anyone to look.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No session lookup here. This layout also renders /login and
  // /denied, so it must not assume a signed-in curator. The gating
  // happens in proxy.ts, in app/(admin)/layout.tsx, in every page, and
  // finally in RLS.
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
