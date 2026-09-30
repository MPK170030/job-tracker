import { useEffect, useState, type FormEvent } from "react";
import "./App.css";
import type { JobApplication, Settings, Source, Status } from "./types";
import { loadSettings, saveSettings } from "./shared/storage";
import { guessSource, parseTitle, sendToSheet, trimApplication } from "./shared/helpers";
import { extractJob } from "./shared/extractor";

const SOURCES: Source[] = ["Greenhouse", "Workday", "Ashby", "Other"];
const STATUSES: Status[] = ["Applied", "Interviewing", "Rejected", "Offer"];

const EMPTY_APPLICATION: JobApplication = {
  company: "",
  role: "",
  location: "",
  source: "Other",
  url: "",
  status: "Applied",
  notes: "",
};

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "added" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

export default function App() {
  const [settings, setSettings] = useState<Settings>({ appsScriptUrl: "", secret: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [application, setApplication] = useState<JobApplication>(EMPTY_APPLICATION);
  const [send, setSend] = useState<SendState>({ kind: "idle" });

  async function handleScan() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: extractJob,
      });
      console.log(
        "[scan]",
        results.map((r) => ({ frameId: r.frameId, result: r.result }))
      );
    } catch (err) {
      console.error("[scan] failed", err);
    }
  }

  // On open: load settings and pre-fill from the current tab
  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setSettingsOpen(!s.appsScriptUrl || !s.secret);
      setSettingsLoaded(true);
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const url = tab?.url;
      if (!url) return;
      const { role, company } = parseTitle(tab.title ?? "");
      setApplication((prev) => ({
        ...prev,
        url,
        source: guessSource(url),
        role,
        company,
      }));
    });
  }, []);

  const settingsReady = settings.appsScriptUrl.trim() !== "" && settings.secret.trim() !== "";
  const formReady =
    application.company.trim() !== "" &&
    application.role.trim() !== "" &&
    application.url.trim() !== "";
  const canLog = settingsReady && formReady && send.kind !== "sending";

  function updateField<K extends keyof JobApplication>(key: K, value: JobApplication[K]) {
    setApplication((prev) => ({ ...prev, [key]: value }));
    // Clear an old result message once the user edits something
    if (send.kind !== "sending") setSend({ kind: "idle" });
  }

  async function handleSaveSettings() {
    const trimmed: Settings = {
      appsScriptUrl: settings.appsScriptUrl.trim(),
      secret: settings.secret.trim(),
    };
    await saveSettings(trimmed);
    setSettings(trimmed);
    setSettingsOpen(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canLog) return;

    setSend({ kind: "sending" });
    try {
      const res = await sendToSheet(settings, trimApplication(application));

      if (res.ok && res.result === "added") {
        setSend({ kind: "added" });
        setTimeout(() => window.close(), 1200);
      } else if (res.ok && res.result === "duplicate") {
        setSend({ kind: "duplicate" });
      } else {
        setSend({ kind: "error", message: res.error ?? "Unknown error" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSend({ kind: "error", message: `Couldn't reach the Sheet: ${message}` });
    }
  }

  if (!settingsLoaded) return null;

  return (
    <div className="app">
      <h1>Log Application</h1>
      <button type="button" onClick={handleScan}>Scan (debug)</button>
      {/* Settings */}
      <section className="settings">
        <button
          type="button"
          className="settings-toggle"
          onClick={() => setSettingsOpen((o) => !o)}
        >
          Settings {settingsOpen ? "▾" : "▸"}
          {!settingsReady && <span className="warning"> (not set up)</span>}
        </button>

        {settingsOpen && (
          <div className="settings-body">
            <label>
              Apps Script URL
              <input
                type="url"
                value={settings.appsScriptUrl}
                placeholder="https://script.google.com/macros/s/.../exec"
                onChange={(e) => setSettings({ ...settings, appsScriptUrl: e.target.value })}
              />
            </label>
            <label>
              Secret
              <input
                type="password"
                value={settings.secret}
                onChange={(e) => setSettings({ ...settings, secret: e.target.value })}
              />
            </label>
            <button type="button" onClick={handleSaveSettings} disabled={!settingsReady}>
              Save settings
            </button>
          </div>
        )}
      </section>

      {/* Application form */}
      <form onSubmit={handleSubmit}>
        <label>
          Company *
          <input
            value={application.company}
            onChange={(e) => updateField("company", e.target.value)}
            autoFocus
          />
        </label>

        <label>
          Role *
          <input value={application.role} onChange={(e) => updateField("role", e.target.value)} />
        </label>

        <label>
          Location
          <input
            value={application.location}
            onChange={(e) => updateField("location", e.target.value)}
          />
        </label>

        <div className="row">
          <label>
            Source
            <select
              value={application.source}
              onChange={(e) => updateField("source", e.target.value as Source)}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={application.status}
              onChange={(e) => updateField("status", e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          URL *
          <input
            type="url"
            value={application.url}
            onChange={(e) => updateField("url", e.target.value)}
          />
        </label>

        <label>
          Notes
          <textarea
            rows={2}
            value={application.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </label>

        <button type="submit" className="primary" disabled={!canLog}>
          {send.kind === "sending" ? "Logging…" : "Log application"}
        </button>
      </form>

      {/* Result */}
      {send.kind === "added" && <p className="result success">✓ Added to your sheet</p>}
      {send.kind === "duplicate" && <p className="result info">Already logged</p>}
      {send.kind === "error" && <p className="result error">{send.message}</p>}
    </div>
  );
}