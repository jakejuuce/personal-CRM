import Link from "next/link";

export function Nav() {
  return (
    <nav style={{ display: "flex", gap: 18, marginBottom: 24, fontSize: 15 }}>
      <Link href="/" style={{ color: "#1a1a1a", textDecoration: "none", fontWeight: 600 }}>
        Match
      </Link>
      <Link href="/contacts" style={{ color: "#555", textDecoration: "none" }}>
        Contacts
      </Link>
      <Link href="/deals" style={{ color: "#555", textDecoration: "none" }}>
        Deals
      </Link>
    </nav>
  );
}
