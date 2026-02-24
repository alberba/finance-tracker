type ReportType = "bug" | "enhancement";

interface ReportPayload {
  type: ReportType;
  summary: string;
  description: string;
  mentionClaude: boolean;
  section: string;
  context: {
    userAgent: string;
    pathname: string;
    timestamp: string;
  };
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
}

interface ReportResponseOk {
  ok: true;
  issueNumber: number;
  issueUrl: string;
}

interface ReportResponseError {
  ok: false;
  error: string;
}

type ReportResponse = ReportResponseOk | ReportResponseError;

function requiredElement<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  return element instanceof HTMLElement ? (element as T) : null;
}

function currentSectionId(): string {
  const activeButton = document.querySelector<HTMLButtonElement>("#nav-tabs .nav-btn.is-active");
  return String(activeButton?.dataset.section || "dashboard");
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function getValidationError(summary: string, description: string): string | null {
  if (!summary || !description) {
    return "Revisa el formulario: resumen y descripción son obligatorios.";
  }
  if (summary.length < 5) {
    return "Revisa el formulario: el resumen debe tener al menos 5 caracteres.";
  }
  if (description.length < 12) {
    return "Revisa el formulario: la descripción debe tener al menos 12 caracteres.";
  }
  return null;
}

async function submitReport(payload: ReportPayload): Promise<ReportResponse> {
  const response = await fetch("/api/issues/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as ReportResponse;
  if (!response.ok) {
    const errorMessage = "error" in data ? data.error : "No se pudo crear la issue.";
    return { ok: false, error: errorMessage };
  }
  return data;
}

(() => {
  const form = requiredElement<HTMLFormElement>("issue-report-form");
  const status = requiredElement<HTMLElement>("issue-report-status");
  const submitButton = requiredElement<HTMLButtonElement>("issue-report-submit");
  if (!form || !status || !submitButton) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const summary = normalizeText(String(formData.get("summary") || ""));
    const description = normalizeText(String(formData.get("description") || ""));
    const validationError = getValidationError(summary, description);
    if (validationError) {
      status.textContent = validationError;
      return;
    }

    const payload: ReportPayload = {
      type: (String(formData.get("type")) === "enhancement" ? "enhancement" : "bug") as ReportType,
      summary,
      description,
      mentionClaude: formData.get("mentionClaude") === "on",
      section: currentSectionId(),
      context: {
        userAgent: navigator.userAgent,
        pathname: window.location.pathname,
        timestamp: new Date().toISOString(),
      },
      stepsToReproduce: normalizeText(String(formData.get("stepsToReproduce") || "")) || undefined,
      expectedResult: normalizeText(String(formData.get("expectedResult") || "")) || undefined,
      actualResult: normalizeText(String(formData.get("actualResult") || "")) || undefined,
    };

    submitButton.disabled = true;
    status.textContent = "Creando issue...";

    try {
      const result = await submitReport(payload);
      if (!result.ok) {
        status.textContent = `No se pudo crear la issue: ${result.error}`;
        return;
      }

      status.textContent = "";
      const prefix = document.createTextNode("Issue creada: ");
      const link = document.createElement("a");
      link.href = result.issueUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `#${result.issueNumber}`;
      status.append(prefix, link);
      form.reset();
      const mentionCheckbox = requiredElement<HTMLInputElement>("issue-report-mention-claude");
      if (mentionCheckbox) {
        mentionCheckbox.checked = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado.";
      status.textContent = `No se pudo crear la issue: ${message}`;
    } finally {
      submitButton.disabled = false;
    }
  });
})();
