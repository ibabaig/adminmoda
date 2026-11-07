"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROOMS = [
  { href: "/", label: "Condition report" },
  { href: "/media", label: "Media" },
  { href: "/images", label: "Images" },
  { href: "/people", label: "Profiles" },
  { href: "/votes", label: "Ballots" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/requests", label: "Requests" },
  { href: "/registry", label: "Registry" },
];

// Client only for usePathname() — the aria-current needs to know which
// room you are standing in. Everything else on these pages is a server
// component.
export default function AdminNav() {
  const path = usePathname();

  return (
    <nav className="admin-nav">
      {ROOMS.map((r) => {
        const active = r.href === "/" ? path === "/" : path.startsWith(r.href);
        return (
          <Link key={r.href} href={r.href} aria-current={active ? "page" : undefined}>
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
