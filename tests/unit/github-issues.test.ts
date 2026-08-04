import { describe, expect, it, vi } from "vitest";
import { createIssueFromWebReport } from "../../src/lib/server/github-issues";
import type { IssueReportPayload } from "../../src/lib/server/issue-report-schema";

const payload: IssueReportPayload = {
  type: "bug",
  summary: "Error al guardar movimiento",
  description: "Al pulsar guardar, no se persiste en servidor.",
  mentionClaude: true,
  section: "transactions",
  context: {
    userAgent: "Playwright",
    pathname: "/movimientos",
    timestamp: "2026-02-23T10:00:00.000Z",
  },
};

describe("github issues service", () => {
  it("crea issue y devuelve número/url", async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 99,
            html_url: "https://github.com/org/repo/issues/99",
          }),
          {
            status: 201,
          },
        ),
    );

    const result = await createIssueFromWebReport(
      payload,
      {
        GITHUB_ISSUE_TOKEN: "token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    expect(result.number).toBe(99);
    expect(result.url).toContain("/issues/99");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [, init] = fakeFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body || "{}"));
    expect(body.labels).toEqual(
      expect.arrayContaining([
        "source:web-report",
        "status:triage",
        "enrich:pending",
        "bug",
      ]),
    );
    expect(body.labels).not.toContain("type:bug");
    expect(body.type).toBe("Bug");
    expect(body.body).toContain("### Resumen");
    expect(body.body).toContain("### Problema o solicitud");
    expect(body.body).toContain("- Se envió desde la sección: transactions");
    expect(body.body).toContain("- Se envió desde la ruta: /movimientos");
    expect(body.body).toContain("@claude");
  });

  it("crea issue simple sin mención ni label de enriquecimiento", async () => {
    const simplePayload: IssueReportPayload = {
      ...payload,
      mentionClaude: false,
    };
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 14,
            html_url: "https://github.com/org/repo/issues/14",
          }),
          {
            status: 201,
          },
        ),
    );

    await createIssueFromWebReport(
      simplePayload,
      {
        GITHUB_ISSUE_TOKEN: "token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    const [, init] = fakeFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body || "{}"));
    expect(body.labels).toEqual(
      expect.arrayContaining(["source:web-report", "status:triage", "bug"]),
    );
    expect(body.labels).not.toContain("type:bug");
    expect(body.type).toBe("Bug");
    expect(body.labels).not.toContain("enrich:pending");
    expect(body.body).not.toContain("@claude");
  });

  it("mapea una mejora a label y tipo Feature", async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 15,
            html_url: "https://github.com/org/repo/issues/15",
          }),
          { status: 201 },
        ),
    );

    await createIssueFromWebReport(
      {
        ...payload,
        type: "feature",
        mentionClaude: false,
      },
      {
        GITHUB_ISSUE_TOKEN: "token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    const [, init] = fakeFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body || "{}"));
    expect(body.labels).toContain("feature");
    expect(body.labels).not.toContain("type:enhancement");
    expect(body.type).toBe("Feature");
  });

  it("reintenta sin tipo estructurado si GitHub no lo admite", async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("unknown issue type", { status: 422 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ number: 16, html_url: "https://x/issues/16" }),
          {
            status: 201,
          },
        ),
      );

    const result = await createIssueFromWebReport(
      payload,
      {
        GITHUB_ISSUE_TOKEN: "token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    expect(result.number).toBe(16);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String(fakeFetch.mock.calls[0][1]?.body || "{}"),
    );
    const fallbackBody = JSON.parse(
      String(fakeFetch.mock.calls[1][1]?.body || "{}"),
    );
    expect(firstBody.type).toBe("Bug");
    expect(fallbackBody).not.toHaveProperty("type");
  });

  it("reintenta errores transitorios", async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ number: 7, html_url: "https://x/issues/7" }),
          {
            status: 201,
          },
        ),
      );

    const result = await createIssueFromWebReport(
      payload,
      {
        GITHUB_ISSUE_TOKEN: "token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    expect(result.number).toBe(7);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("lanza error en fallo no recuperable", async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () => new Response("forbidden", { status: 403 }),
    );

    await expect(
      createIssueFromWebReport(
        payload,
        {
          GITHUB_ISSUE_TOKEN: "token",
          GITHUB_OWNER: "org",
          GITHUB_REPO: "repo",
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    ).rejects.toThrowError(/GitHub API devolvió 403/);
  });

  it("usa GITHUB_TOKEN cuando GITHUB_ISSUE_TOKEN no está definido", async () => {
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            number: 5,
            html_url: "https://github.com/org/repo/issues/5",
          }),
          {
            status: 201,
          },
        ),
    );

    await createIssueFromWebReport(
      payload,
      {
        GITHUB_TOKEN: "fallback-token",
        GITHUB_OWNER: "org",
        GITHUB_REPO: "repo",
      },
      { fetch: fakeFetch as unknown as typeof fetch },
    );

    const [, init] = fakeFetch.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer fallback-token",
    });
  });

  it("lanza error si no hay ningún token configurado", async () => {
    const fakeFetch = vi.fn<typeof fetch>();

    await expect(
      createIssueFromWebReport(
        payload,
        {
          GITHUB_OWNER: "org",
          GITHUB_REPO: "repo",
        },
        { fetch: fakeFetch as unknown as typeof fetch },
      ),
    ).rejects.toThrowError(/GITHUB_ISSUE_TOKEN o GITHUB_TOKEN/);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
