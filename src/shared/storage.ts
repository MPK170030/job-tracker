import type { Settings } from "../types";

export async function loadSettings():Promise<Settings> {
    const items = await chrome.storage.sync.get(["appsScriptUrl", "secret"]);
    return {
        appsScriptUrl: typeof items.appsScriptUrl === "string" ? items.appsScriptUrl : "",
        secret: typeof items.secret === "string" ? items.secret : "",
    };
}

export async function saveSettings(settings:Settings):Promise<void> {
    await chrome.storage.sync.set({
        appsScriptUrl: settings.appsScriptUrl.trim(),
        secret: settings.secret.trim(),
    });
}
