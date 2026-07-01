import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_REDIRECT_HOSTS = [
  "staging.meccha.fun",
  "localhost",
];

/**
 * Determines the safe public origin for redirects.
 *
 * Problem: When Next.js standalone proxies through nginx to 127.0.0.1,
 * the Host header becomes "localhost:4201" because nginx resolves
 * staging.meccha.fun → 127.0.0.1. So requestUrl.origin is wrong.
 *
 * Solution: Use X-Forwarded-Host (set by Cloudflare to the original
 * public hostname) or SITE_URL env var to construct the correct origin.
 */
function getPublicOrigin(request: NextRequest, fallbackOrigin: string): string {
  // Cloudflare sets X-Forwarded-Host to the original public hostname
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const safe = ALLOWED_REDIRECT_HOSTS.some(
      (h) =>
        forwardedHost === h ||
        forwardedHost === `localhost:${process.env.PORT ?? "4201"}` ||
        forwardedHost.endsWith(`.${h}`)
    );
    if (safe) {
      const protocol = new URL(request.url).protocol;
      return `${protocol}//${forwardedHost}`;
    }
  }

  // Fallback: use SITE_URL env var if set (set to https://staging.meccha.fun on VPS)
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }

  return fallbackOrigin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (code) {
    try {
      const supabase = await createServerAnonClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch (err) {
      console.error("[auth/callback] exchangeCodeForSession failed:", err);
      // Still redirect to home — don't leave user stranded on callback URL
    }
  }

  const origin = getPublicOrigin(request, requestUrl.origin);
  return NextResponse.redirect(new URL(next, origin));
}
