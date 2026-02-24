import fs from "node:fs";
import path from "node:path";

const MAX_MATCHES = 8;

export function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s-]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 40);
}

function scoreFile(filePath, tokens) {
  const lower = filePath.toLowerCase();
  return tokens.reduce((score, token) => (lower.includes(token) ? score + 1 : score), 0);
}

export function findCandidateFiles(repoFiles, issueText) {
  const tokens = tokenize(issueText);
  const scored = repoFiles
    .map((filePath) => ({ filePath, score: scoreFile(filePath, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .slice(0, MAX_MATCHES)
    .map((item) => item.filePath);

  if (scored.length) {
    return scored;
  }

  return repoFiles
    .filter((filePath) => filePath.startsWith("src/") || filePath.startsWith("tests/"))
    .slice(0, MAX_MATCHES);
}

export function buildIssueContextMarkdown(issue, candidateFiles) {
  const labels = Array.isArray(issue?.labels)
    ? issue.labels.map((label) => (typeof label === "string" ? label : String(label?.name || ""))).filter(Boolean)
    : [];

  const body = String(issue?.body || "").trim();
  const summary = String(issue?.title || "(sin título)").trim();

  const lines = [
    "# Contexto inicial de issue",
    "",
    `- Número: #${Number(issue?.number || 0) || "n/a"}`,
    `- Título: ${summary}`,
    `- Labels actuales: ${labels.length ? labels.join(", ") : "ninguna"}`,
    "",
    "## Descripción original",
    "",
    body || "(sin cuerpo)",
    "",
    "## Archivos candidatos",
    "",
    ...candidateFiles.map((filePath) => `- \`${filePath}\``),
    "",
    "## Instrucciones",
    "",
    "- Enriquecer la issue con hipótesis técnica y criterios de aceptación.",
    "- Proponer labels de área y prioridad.",
    "- Mantener el idioma español.",
  ];

  return lines.join("\n");
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    args.set(key, next);
  }
  return args;
}

function collectRepoFiles(rootDir) {
  const output = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const absolute = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      const relative = path.relative(rootDir, absolute).replace(/\\/g, "/");
      if (!relative) {
        continue;
      }

      if (/\.(ts|tsx|astro|js|mjs|css|json|md|yml|yaml)$/i.test(relative)) {
        output.push(relative);
      }
    }
  }

  walk(rootDir);
  return output;
}

function runCli() {
  const args = parseArgs(process.argv);
  const issueFile = args.get("issue-file");
  const outputFile = args.get("out");
  const rootDir = args.get("repo") || process.cwd();

  if (!issueFile || !outputFile) {
    throw new Error("Uso: node issue-context.mjs --issue-file <path> --out <path> [--repo <path>]");
  }

  const issueRaw = fs.readFileSync(issueFile, "utf-8");
  const issue = JSON.parse(issueRaw);
  const repoFiles = collectRepoFiles(rootDir);
  const issueText = `${issue?.title || ""}\n${issue?.body || ""}`;
  const candidates = findCandidateFiles(repoFiles, issueText);
  const markdown = buildIssueContextMarkdown(issue, candidates);

  fs.writeFileSync(outputFile, markdown, "utf-8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
