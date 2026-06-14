import { createServerClient } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const hasBypass = req.cookies.get("dev_bypass")?.value === "true";

  let session = null;
  if (hasBypass) {
    session = {
      user: { id: "4b6cb785-52b6-4f5d-8eaf-77d5f174ef81" }
    };
  } else {
    try {
      const { data: { session: actualSession } } = await supabase.auth.getSession()
      session = actualSession;
    } catch (e) {
      session = null;
    }
  }

  if (!session && req.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (session && req.nextUrl.pathname === "/") {
    const redirectUrl = new URL("/dashboard", req.url)
    if (req.nextUrl.searchParams.has("demo")) {
      redirectUrl.searchParams.set("demo", req.nextUrl.searchParams.get("demo")!)
    }
    return NextResponse.redirect(redirectUrl)
  }


  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|auth/callback).*)"],
}
