import type { RuntimeEnv } from "./cloudflare-env";
import type { IssueReportPayload } from "./issue-report-schema";

export interface CreatedIssue {
  number: number;
  url: string;
}

export interface GithubIssueClient {
  fetch: typeof fetch;
}

const GITHUB_API_BASE = "https://api.github.com";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function requiredEnv(name: keyof RuntimeEnv, env: RuntimeEnv): string {
  const value = String(env[name] || "").trim();
  if (!value) {
    throw new Error(`Falta variable de entorno requerida: ${name}`);
  }
  return value;
}

function requiredAnyEnv(
  names: ReadonlyArray<keyof RuntimeEnv>,
  env: RuntimeEnv,
): string {
  for (const name of names) {
    const value = String(env[name] || "").trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Falta variable de entorno requerida: ${names.join(" o ")}`);
}

function buildIssueBody(payload: IssueReportPayload): string {
  const baseLines = [
    "## Reporte desde la web",
    "",
    payload.description,
    "",
    `- Tipo: ${payload.type}`,
    `- Se envió desde la sección: ${payload.section}`,
    `- Se envió desde la ruta: ${payload.context.pathname || "n/a"}`,
    `- Navegador: ${payload.context.userAgent || "n/a"}`,
    `- Fecha cliente: ${payload.context.timestamp || "n/a"}`,
  ];

  if (payload.stepsToReproduce) {
    baseLines.push(
      "",
      "## Pasos para reproducir",
      "",
      payload.stepsToReproduce,
    );
  }

  if (payload.expectedResult) {
    baseLines.push("", "## Resultado esperado", "", payload.expectedResult);
  }

  if (payload.actualResult) {
    baseLines.push("", "## Resultado actual", "", payload.actualResult);
  }

  if (payload.mentionClaude) {
    baseLines.push("", "@claude");
  }

  return baseLines.join("\n").trim();
}

function buildLabels(type: IssueReportPayload["type"]): string[] {
  return ["source:web-report", "status:triage", `type:${type}`];
}

async function requestWithRetry(
  requestFn: () => Promise<Response>,
  retries: number,
  retryDelayMs: number,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await requestFn();
    if (!RETRYABLE_STATUS.has(response.status)) {
      return response;
    }
    lastResponse = response;

    if (attempt < retries) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * (attempt + 1)),
      );
    }
  }

  return lastResponse as Response;
}

export async function createIssueFromWebReport(
  payload: IssueReportPayload,
  env: RuntimeEnv,
  client: GithubIssueClient = { fetch: globalThis.fetch.bind(globalThis) },
): Promise<CreatedIssue> {
  const token = requiredAnyEnv(["GITHUB_ISSUE_TOKEN", "GITHUB_TOKEN"], env);
  const owner = requiredEnv("GITHUB_OWNER", env);
  const repo = requiredEnv("GITHUB_REPO", env);
  const title = payload.summary.slice(0, 140);

  const response = await requestWithRetry(
    () =>
      client.fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "finance-tracker-web-reporter",
        },
        body: JSON.stringify({
          title,
          body: buildIssueBody(payload),
          labels: payload.mentionClaude
            ? [...buildLabels(payload.type), "enrich:pending"]
            : buildLabels(payload.type),
        }),
      }),
    2,
    500,
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `GitHub API devolvió ${response.status}: ${details.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    number?: number;
    html_url?: string;
  };
  const issueNumber = Number(data.number);
  const issueUrl = String(data.html_url || "");
  if (!Number.isFinite(issueNumber) || !issueUrl) {
    throw new Error("Respuesta inválida al crear issue en GitHub.");
  }

  return { number: issueNumber, url: issueUrl };
}
