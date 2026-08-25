import type { APIRoute } from "astro";

import { getDb } from "../../../db/client";
import { integrationCredentialsRepository } from "../../../db/repositories";
import {
  jsonResponse,
  requirePrincipal,
  withApiErrorHandling,
} from "../../../lib/server/api-auth";
import { getRuntimeEnvFromLocals } from "../../../lib/server/cloudflare-env";

const PROVIDER = "stockevents";
const MAX_API_KEY_LENGTH = 512;

async function getCredential(locals: App.Locals) {
  const principal = requirePrincipal(locals);
  const db = getDb(locals);
  const env = getRuntimeEnvFromLocals(locals);
  const credential = await integrationCredentialsRepository.getByProvider(
    db,
    principal.userId,
    PROVIDER,
    env,
  );
  return { credential, db, env, userId: principal.userId };
}

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling(async () => {
    const { credential } = await getCredential(locals);
    return jsonResponse({ configured: Boolean(credential) }, 200);
  });

export const PUT: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling(async () => {
    const body = (await request.json()) as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > MAX_API_KEY_LENGTH) {
      return jsonResponse({ error: "API key inválida." }, 400);
    }

    const { credential, db, env, userId } = await getCredential(locals);
    if (credential) {
      await integrationCredentialsRepository.update(db, userId, credential.id, { secret: apiKey }, env);
    } else {
      await integrationCredentialsRepository.create(db, userId, { provider: PROVIDER, secret: apiKey }, env);
    }
    return jsonResponse({ configured: true }, 200);
  });

export const DELETE: APIRoute = async ({ locals }) =>
  withApiErrorHandling(async () => {
    const { credential, db, userId } = await getCredential(locals);
    if (credential) {
      await integrationCredentialsRepository.remove(db, userId, credential.id);
    }
    return jsonResponse({ configured: false }, 200);
  });
