import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that do NOT require a signed-in session */
const PUBLIC_PATHS = ["/", "/auth"];

/** API prefixes that must stay open (local worker uses its own token auth, cron uses secrets) */
const PUBLIC_API_PREFIXES = ["/api/local-worker", "/api/image-collector/cron"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(p));
}

// Public, non-secret fallbacks for the main project so the proxy always
// targets the correct project even if the env vars are unset.
const SUPABASE_URL = "https://wcwhsfvkhefrcfiigauu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjd2hzZnZraGVmcmNmaWlnYXV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMzI4OTgsImV4cCI6MjA5NjgwODg5OH0.R19NqRIBCsG0xD10z2dtcLoMogsYh4InsPbEoREogQA";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = envUrl?.startsWith("https://") ? envUrl : SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath(pathname) && !isPublicApi) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "login");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
