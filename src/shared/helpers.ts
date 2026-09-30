import type { JobApplication, SheetResponse, Settings, Source } from "../types";

export function guessSource(url: string): Source {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("greenhouse.io")) return "Greenhouse";
    if (host.endsWith("myworkdayjobs.com")) return "Workday";
    if (host.endsWith("ashbyhq.com")) return "Ashby";
    if (host.endsWith("myworkdaysite.com")) return "Workday";
  } catch {
    // Not a valid URL (e.g. chrome:// pages) – fall through
  }
  return "Other";
}

export function parseTitle(title: string): { role: string; company: string } {
  const clean = title.trim();

  const greenhouse = clean.match(/^Job Application for (.+) at (.+)$/i);
  if (greenhouse) {
    return { role: greenhouse[1].trim(), company: greenhouse[2].trim() };
  }

  const role = clean.split(/\s[-|–—]\s/)[0].trim();
  return { role, company: "" };
}

export function trimApplication(app: JobApplication): JobApplication {
  return {
    ...app,
    company: app.company.trim(),
    role: app.role.trim(),
    location: app.location.trim(),
    url: app.url.trim(),
    notes: app.notes.trim(),
  };
}

export async function sendToSheet(
  settings: Settings,
  app: JobApplication
): Promise<SheetResponse> {
  const res = await fetch(settings.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...app, token: settings.secret }),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as SheetResponse;
  } catch {
    return { ok: false, error: `Unexpected response from Apps Script (HTTP ${res.status})` };
  }
}