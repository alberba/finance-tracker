import { describe, expect, it } from "vitest";
import { parseIssueReportPayload } from "../../src/lib/server/issue-report-schema";

describe("issue report schema", () => {
  it("normaliza y valida payload válido", () => {
    const parsed = parseIssueReportPayload({
      type: "bug",
      summary: "  Falla guardado\u0001  ",
      description: "  El sistema no guarda al recargar.  ",
      mentionClaude: true,
      section: "data",
      context: {
        userAgent: "Browser",
        pathname: "/datos",
        timestamp: "2026-02-23T10:00:00.000Z",
      },
    });

    expect(parsed.summary).toBe("Falla guardado");
    expect(parsed.description).toBe("El sistema no guarda al recargar.");
    expect(parsed.mentionClaude).toBe(true);
  });

  it("usa automatización desactivada por defecto", () => {
    const parsed = parseIssueReportPayload({
      type: "enhancement",
      summary: "Mejorar mensajes",
      description: "Conviene separar el reporte simple del flujo automático.",
      section: "reports",
      context: {},
    });

    expect(parsed.mentionClaude).toBe(false);
  });

  it("normaliza enhancement legacy a feature", () => {
    const parsed = parseIssueReportPayload({
      type: "enhancement",
      summary: "Mejorar el resumen de incidencias",
      description: "La issue necesita contexto técnico para poder revisarse.",
      section: "reports",
      context: {},
    });

    expect(parsed.type).toBe("feature");
  });

  it("rechaza payload inválido", () => {
    expect(() =>
      parseIssueReportPayload({
        type: "bug",
        summary: "bad",
        description: "corta",
        section: "data",
        context: {},
      }),
    ).toThrowError();
  });
});
