import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that do NOT require a signed-in session */
const PUBLIC_PATHS = ["/", "/auth"];

/** API prefixes that must stay open (local worker uses its own token auth, cron uses secrets) */
const PUBLIC_API_PREFIXES = ["/api/local-worker", "/api/image-collector/cron"];

/** Internal maintenance APIs may be called from server scripts with the service-role key. */
const SERVICE_ROLE_AUTH_API_PATHS = ["/api/infringement-reference-library"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get("authorization") ?? "";

  if (
    serviceRoleKey &&
    SERVICE_ROLE_AUTH_API_PATHS.includes(pathname) &&
    authorization === `Bearer ${serviceRoleKey}`
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
