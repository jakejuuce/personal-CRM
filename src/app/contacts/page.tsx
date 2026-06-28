import { loadAllContacts } from "@/lib/data";
import { Nav } from "../nav";
import { ContactsTable, type ContactRow } from "./contacts-table";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  let rows: ContactRow[] = [];
  let error: string | null = null;
  try {
    const contacts = await loadAllContacts();
    rows = contacts.map((c) => ({
      id: c.person.id,
      name: c.person.name,
      type: c.person.type,
      company: c.person.company,
      caliber: c.person.caliber,
      links: c.person.links,
      notes: c.person.notes,
      intentKind: c.intent?.kind ?? null,
      stages: c.intent?.stages ?? [],
      verticals: c.intent?.verticals ?? [],
      exclusions: c.intent?.exclusions ?? [],
      wildcard: c.intent?.wildcard ?? false,
      thesis: c.intent?.thesis_text ?? null,
      tie_strength: c.relationship?.tie_strength ?? null,
      last_touch: c.relationship?.last_touch ?? null,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "could not load contacts";
  }

  return (
    <main>
      <Nav />
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Contacts</h1>
      <p style={{ color: "#666", marginTop: 0 }}>{rows.length} contacts. Add, edit, attach LinkedIns, export.</p>
      {error ? <p style={{ color: "#b00" }}>{error}</p> : <ContactsTable initial={rows} />}
    </main>
  );
}
