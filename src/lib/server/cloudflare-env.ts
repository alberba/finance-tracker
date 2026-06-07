import type { D1DatabaseLike } from "./d1-state";

export interface RuntimeEnv {
  finance_tracker_db?: D1DatabaseLike;
  GITHUB_ISSUE_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
}

type LocalsWithRuntime = {
  runtime?: {
    env?: RuntimeEnv;
  };
};

export function getD1FromLocals(locals: App.Locals): D1DatabaseLike {
  const db = (locals as LocalsWithRuntime)?.runtime?.env?.finance_tracker_db;
  if (!db) {
    throw new Error(
      "D1 binding 'finance_tracker_db' no está disponible en runtime.",
    );
  }
  return db;
}

export function getRuntimeEnvFromLocals(locals: App.Locals): RuntimeEnv {
  const env = (locals as LocalsWithRuntime)?.runtime?.env;
  if (!env) {
    throw new Error("Runtime env no disponible en locals.runtime.env.");
  }
  return env;
}
