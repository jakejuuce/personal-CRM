// GET  /api/contacts  → every contact with its fields (the directory)
// POST /api/contacts  → add a contact
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAllContacts, createContact, type ContactInput } from "@/lib/data";

export async function GET() {
  try {
    const contacts = await loadAllContacts();
    return NextResponse.json({ contacts });
  } catch (err) {
    console.error(JSON.stringify({ at: "api/contacts GET", error: String(err) }));
    return NextResponse.json({ error: "could not load contacts" }, { status: 500 });
  }
}

const Body = z.object({
  type: z.enum(["founder", "vc", "other"]),
  name: z.string().min(1),
  company: z.string().nullable().optional(),
  caliber: z.number().min(1).max(5).nullable().optional(),
  links: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  intent: z
    .object({
      kind: z.enum(["raising", "investing"]),
      stages: z.array(z.string()).optional(),
      verticals: z.array(z.string()).optional(),
      exclusions: z.array(z.string()).optional(),
      wildcard: z.boolean().optional(),
      amount_low: z.number().nullable().optional(),
      amount_high: z.number().nullable().optional(),
      thesis_text: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  relationship: z
    .object({
      tie_strength: z.number().min(1).max(5).nullable().optional(),
      last_touch: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid contact", detail: String(e) }, { status: 400 });
  }
  try {
    const id = await createContact(body as ContactInput);
    return NextResponse.json({ id });
  } catch (err) {
    console.error(JSON.stringify({ at: "api/contacts POST", error: String(err) }));
    return NextResponse.json({ error: "could not create contact" }, { status: 500 });
  }
}
