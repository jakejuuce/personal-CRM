// Magic-link callback: exchange the code for a session cookie, then land on the app.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const res = NextResponse.redirect(new URL("/", req.url));
  if (!code) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );
  await supabase.auth.exchangeCodeForSession(code);
  return res;
}
