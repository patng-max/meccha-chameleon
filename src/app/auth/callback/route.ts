import { createServerAnonClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";

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

  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }

  return fallbackOrigin;
}

/**
 * Sanitizes an Error for safe logging — strips cookies, auth headers,
 * tokens, codes, and secrets. Returns only type, message, and stack.
 */
function sanitizeError(err: unknown): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  if (err instanceof Error) {
    safe.type = err.constructor.name;
    safe.message = err.message;
    // Stack may contain file paths — include it for debugging
    if (err.stack) {
      // Remove any query string / cookie values that might have leaked
      safe.stack = err.stack
        .replace(/[?&][^=]+=[^&\s]*/g, (match) => match.slice(0, match.indexOf("=") + 1) + "[REDACTED]")
        .replace(/"(access_token|refresh_token|token|code|secret|key|auth)[^"]*"/gi, (m) => m.replace(/: *"[^"]*"/, `: "[REDACTED]"`));
    }
  } else if (err !== null && typeof err === "object") {
    safe.type = Object.prototype.toString.call(err);
    // Strip any field that looks like a secret or token
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(err as Record<string, unknown>)) {
      const key = k.toLowerCase();
      const isSecret =
        /token|secret|key|auth|password|code|cookie|credential/i.test(k) &&
        typeof v === "string" &&
        v.length > 0;
      sanitized[k] = isSecret ? "[REDACTED]" : typeof v === "object" ? "[object]" : v;
    }
    safe.payload = sanitized;
  } else {
    safe.type = typeof err;
    safe.value = String(err).slice(0, 100);
  }

  return safe;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  if (code) {
    try {
      const supabase = await createServerAnonClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        // Auth error — log sanitized, still redirect home
        console.error(
          JSON.stringify({
            level: "auth_error",
            requestId,
            timestamp,
            route: "/auth/callback",
            error: sanitizeError(error),
            // Never log the code — just indicate it was present
            codePresent: true,
          })
        );
      }
    } catch (err) {
      // Unexpected exception — log sanitized, redirect home, don't crash
      console.error(
        JSON.stringify({
          level: "callback_exception",
          requestId,
          timestamp,
          route: "/auth/callback",
          error: sanitizeError(err),
          codePresent: true,
        })
      );
    }
  }

  const origin = getPublicOrigin(request, requestUrl.origin);
  return NextResponse.redirect(new URL(next, origin));
}
