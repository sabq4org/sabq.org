import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const NOINDEX_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function middleware(request: NextRequest) {
  // Railway needs an unauthenticated health endpoint to determine readiness.
  if (request.nextUrl.pathname === "/health") {
    return NextResponse.next();
  }

  const accessToken = process.env.STAGING_ACCESS_TOKEN;
  if (!accessToken) {
    // Production does not define the staging token, so its behavior is
    // unchanged and no authentication layer is added.
    return NextResponse.next();
  }

  const expected = `Basic ${btoa(`sabq:${accessToken}`)}`;
  if (request.headers.get("authorization") === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Railway staging access is restricted.", {
    status: 401,
    headers: {
      ...NOINDEX_HEADERS,
      "WWW-Authenticate": 'Basic realm="Sabq Railway staging", charset="UTF-8"',
    },
  });
}

export const config = {
  // Static assets contain no private data and can remain directly cacheable.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
