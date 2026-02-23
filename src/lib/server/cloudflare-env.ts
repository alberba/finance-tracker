import type { D1DatabaseLike } from "./d1-state";

type LocalsWithRuntime = {
  runtime?: {
    env?: {
      finance_tracker_db?: D1DatabaseLike;
    };
  };
};

export function getD1FromLocals(locals: App.Locals): D1DatabaseLike {
  const db = (locals as LocalsWithRuntime)?.runtime?.env?.finance_tracker_db;
  if (!db) {
    throw new Error("D1 binding 'finance_tracker_db' no está disponible en runtime.");
  }
  return db;
}
