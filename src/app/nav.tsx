"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Match" },
  { href: "/contacts", label: "Contacts" },
  { href: "/deals", label: "Deals" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <span className="nav-brand">
        relay<span className="dot">.</span>
      </span>
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
