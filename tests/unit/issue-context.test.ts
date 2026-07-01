import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildIssueContextMarkdown,
  findCandidateFiles,
} from "../../.github/scripts/issue-context.mjs";

describe("issue context helper", () => {
  it("selecciona archivos candidatos por tokens", () => {
    const files = [
      "src/components/FinanceTrackerShell.astro",
      "src/scripts/transactions.ts",
      "tests/e2e/finance-tracker.spec.ts",
    ];

    const candidates = findCandidateFiles(
      files,
      "Error en transactions y filtro de tabla",
    );
    expect(candidates[0]).toContain("transactions");
  });

  it("genera markdown con secciones clave", () => {
    const markdown = buildIssueContextMarkdown(
      {
        number: 10,
        title: "No guarda",
        body: "Descripción base",
        labels: [{ name: "source:web-report" }],
      },
      ["src/scripts/app.ts"],
    );

    expect(markdown).toContain("# Contexto inicial de issue");
    expect(markdown).toContain("`src/scripts/app.ts`");
  });

  it("ejecuta CLI y escribe archivo de salida", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-context-"));
    const issueFile = path.join(tmpDir, "issue.json");
    const outFile = path.join(tmpDir, "out.md");

    fs.writeFileSync(
      issueFile,
      JSON.stringify({
        number: 1,
        title: "Fallo dashboard",
        body: "Error KPI",
        labels: [],
      }),
      "utf-8",
    );

    const scriptPath = path.resolve(".github/scripts/issue-context.mjs");
    const result = spawnSync(
      "node",
      [
        scriptPath,
        "--issue-file",
        issueFile,
        "--out",
        outFile,
        "--repo",
        process.cwd(),
      ],
      {
        encoding: "utf-8",
      },
    );
    expect(result.status).toBe(0);

    const out = fs.readFileSync(outFile, "utf-8");
    expect(out).toContain("Contexto inicial");
  });
});
