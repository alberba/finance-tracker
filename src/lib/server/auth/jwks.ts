/**
 * Cf-Access JWT verification (WP3).
 *
 * Cloudflare Access signs the `Cf-Access-Jwt-Assertion` header with keys
 * published at `https://<team-domain>/cdn-cgi/access/certs`. We use `jose`'s
 * `createRemoteJWKSet`, which already does fetch + in-memory caching + a
 * cooldown against repeated fetch storms on an unknown `kid` — no extra
 * caching layer needed on top of it.
 *
 * One `RemoteJWKSet` is kept per team-domain URL for the lifetime of the
 * Worker isolate (module-level cache), matching the plan's "fetch+cache
 * JWKS" file split.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/** Claims we actually rely on out of the Cf-Access JWT payload. */
export interface CfAccessClaims {
  /** Cloudflare Access' stable subject identifier for this identity. */
  sub: string;
  /** The authenticated user's email, when the IdP supplies one. */
  email?: string;
}

export interface AccessJwtConfig {
  /** e.g. `myteam.cloudflareaccess.com` — no scheme, no path. */
  teamDomain: string;
  /**
   * Expected `aud` claim(s) — each an Access Application's AUD tag. A token
   * matching *any* of them is accepted, because one deployment can sit behind
   * more than one Access application: the production hostname has its own app,
   * and the Worker-level "previews only" policy creates a second app with a
   * different AUD (see `parseAudiences`).
   */
  audience: string | string[];
}

/**
 * Reads `CF_ACCESS_AUD`, which holds one AUD tag or several separated by
 * commas. Returns them in order, dropping blanks so a trailing comma or a
 * stray space in the dashboard cannot turn into an empty audience that `jose`
 * would then match nothing against.
 */
export function parseAudiences(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((aud) => aud.trim())
    .filter((aud) => aud.length > 0);
}

type RemoteJwkSet = ReturnType<typeof createRemoteJWKSet>;

const jwksByUrl = new Map<string, RemoteJwkSet>();

function buildJwksUrl(teamDomain: string): string {
  return `https://${teamDomain}/cdn-cgi/access/certs`;
}

function getJwks(jwksUrl: string): RemoteJwkSet {
  let jwks = jwksByUrl.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksByUrl.set(jwksUrl, jwks);
  }
  return jwks;
}

/**
 * Verifies a `Cf-Access-Jwt-Assertion` token: signature against the team's
 * JWKS, plus `iss`/`aud` claim checks. Throws (via `jose`'s typed errors —
 * `JWTExpired`, `JWSSignatureVerificationFailed`, `JWTClaimValidationFailed`,
 * etc.) on any invalid/expired/wrong-audience token; callers decide how to
 * respond (see `src/middleware.ts`).
 */
export async function verifyAccessJwt(
  token: string,
  config: AccessJwtConfig,
): Promise<CfAccessClaims> {
  const jwksUrl = buildJwksUrl(config.teamDomain);
  const jwks = getJwks(jwksUrl);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${config.teamDomain}`,
    audience: config.audience,
  });

  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  if (!sub) {
    throw new Error("Cf-Access JWT no incluye un claim 'sub' válido.");
  }
  const email = typeof payload.email === "string" ? payload.email : undefined;

  return { sub, email };
}
