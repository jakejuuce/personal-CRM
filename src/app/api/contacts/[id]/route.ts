// PATCH /api/contacts/[id]  → edit person fields (name, company, caliber, links/LinkedIn, notes)
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateContact } from "@/lib/data";

const Patch = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullable().optional(),
  caliber: z.number().min(1).max(5).nullable().optional(),
  links: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let patch: z.infer<typeof Patch>;
  try {
    patch = Patch.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid patch", detail: String(e) }, { status: 400 });
  }
  try {
    await updateContact(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ at: "api/contacts PATCH", error: String(err) }));
    return NextResponse.json({ error: "could not update contact" }, { status: 500 });
  }
}
