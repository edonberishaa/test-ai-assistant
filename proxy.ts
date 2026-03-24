import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  const authCookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter(
      (name) =>
        name.startsWith("sb-") &&
        (name.includes("-auth-token") || name.includes("-code-verifier")),
    );

  authCookieNames.forEach((name) => {
    request.cookies.delete(name);
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  });
}

export async function proxy(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user = null;

  try {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      const isMissingRefreshToken =
        error.code === "refresh_token_not_found" ||
        error.message?.toLowerCase().includes("refresh token not found");

      if (isMissingRefreshToken) {
        clearSupabaseAuthCookies(request, supabaseResponse);
      } else {
        console.error("[proxy] auth.getUser error:", error.message);
      }
    } else {
      user = authUser;
    }
  } catch (error) {
    console.error("[proxy] auth.getUser threw:", error);
    clearSupabaseAuthCookies(request, supabaseResponse);
  }

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isDashboardRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/assistants");

  if (!user && isDashboardRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/dashboard/:path*",
    "/assistants/:path*",
    "/login",
    "/signup",
  ],
};
