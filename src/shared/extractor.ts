import type { ExtractedJob, Source } from "../types";

type LayerResult = {
  role?: string;
  company?: string;
  location?: string;
  jobId?: string;
};

export function extractJob(): ExtractedJob {
  function clean(text: unknown): string | undefined {
    if (typeof text !== "string" || text.trim() === "") return undefined;
    const doc = new DOMParser().parseFromString(text, "text/html");
    const result = (doc.documentElement.textContent ?? "").replace(/\s+/g, " ").trim();
    return result === "" ? undefined : result;
  }

  const PLATFORM_HOSTS = [
    "greenhouse.io",
    "myworkdayjobs.com",
    "myworkdaysite.com",
    "ashbyhq.com",
    "lever.co",
  ];

  function isPlatformHost(hostname: string): boolean {
    return PLATFORM_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  }

  function isPlatformName(name: string): boolean {
    return /^(greenhouse|workday|ashby|lever|linkedin|indeed)$/i.test(name.trim());
  }

  function detectSource(hostname: string): Source {
    if (hostname.endsWith("greenhouse.io")) return "Greenhouse";
    if (hostname.endsWith("myworkdayjobs.com") || hostname.endsWith("myworkdaysite.com")) {
      return "Workday";
    }
    if (hostname.endsWith("ashbyhq.com")) return "Ashby";
    return "Other";
  }

  function splitTitle(text: string | undefined): { role?: string; company?: string } {
    const title = clean(text);
    if (!title) return {};

    // Greenhouse pattern
    const greenhouseMatch = title.match(/^Job Application for (.+) at (.+)$/i);
    if (greenhouseMatch) {
      return { role: clean(greenhouseMatch[1]), company: clean(greenhouseMatch[2]) };
    }

    const rawParts = title.split(/\s[-|–—·]\s/);
    const hadSeparator = rawParts.length > 1;

    const NOISE = /^(careers?|jobs?|job board|open positions|apply)$/i;
    const parts = rawParts
      .map((p) =>
        clean(
          p
            .replace(/^(careers|jobs) at /i, "")
            .replace(/ (careers|jobs)$/i, "")
        )
      )
      .filter((p): p is string => !!p && !NOISE.test(p));

    if (parts.length >= 2) {
      return { role: parts[0], company: parts[parts.length - 1] };
    }

    if (!hadSeparator) {
      const idx = title.toLowerCase().lastIndexOf(" at ");
      if (idx > 0) {
        return { role: clean(title.slice(0, idx)), company: clean(title.slice(idx + 4)) };
      }
    }

    return { role: parts[0] ?? title };
  }

  function fromJsonLd(): LayerResult {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    const candidates: any[] = [];
    scripts.forEach((el) => {
      let parsed: any;
      try {
        parsed = JSON.parse(el.textContent ?? "");
      } catch {
        return;
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (Array.isArray(item?.["@graph"])) {
          candidates.push(...item["@graph"]);
        } else {
          candidates.push(item);
        }
      }
    });

    const posting = candidates.find((c) => {
      if (!c || typeof c !== "object") return false;
      const type = c["@type"];
      return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
    });
    if (!posting) return {};

    const role = clean(posting.title) ?? clean(posting.name);

    const org = posting.hiringOrganization;
    const company = typeof org === "string" ? clean(org) : clean(org?.name);

    const id = posting.identifier;
    const rawId = typeof id === "object" && id !== null ? id.value : id;
    const jobId = rawId != null ? clean(String(rawId)) : undefined;

    const rawLocations = posting.jobLocation;
    const locationList: any[] = Array.isArray(rawLocations)
      ? rawLocations
      : rawLocations
        ? [rawLocations]
        : [];

    const places = locationList
      .map((loc) => {
        const addr = loc?.address;
        if (!addr) return undefined;
        if (typeof addr === "string") return clean(addr);

        const cityRegion = [clean(addr.addressLocality), clean(addr.addressRegion)]
          .filter(Boolean)
          .join(", ");
        if (cityRegion) return cityRegion;

        const country = addr.addressCountry;
        return typeof country === "string" ? clean(country) : clean(country?.name);
      })
      .filter((p): p is string => !!p);

    const uniquePlaces = [...new Set(places)];
    const isRemote = posting.jobLocationType === "TELECOMMUTE";

    let locationText: string | undefined;
    if (uniquePlaces.length > 0) {
      locationText = uniquePlaces.join("; ") + (isRemote ? " (Remote)" : "");
    } else if (isRemote) {
      locationText = "Remote";
    }

    return { role, company, location: clean(locationText), jobId };
  }

  function fromMeta(): LayerResult {
    function readMeta(selector: string): string | undefined {
      return clean(document.querySelector(selector)?.getAttribute("content"));
    }

    const siteName = readMeta('meta[property="og:site_name"]');
    const ogTitle =
      readMeta('meta[property="og:title"]') ?? readMeta('meta[name="twitter:title"]');

    const split = splitTitle(ogTitle);

    const company = siteName && !isPlatformName(siteName) ? siteName : split.company;

    return { role: split.role, company };
  }

  function fromTitle(): LayerResult {
    return splitTitle(document.title);
  }

  function fromDomain(): LayerResult {
    let host = window.location.hostname.toLowerCase();
    if (isPlatformHost(host)) return {};

    const PREFIX = /^(www|careers|jobs|apply)\./;
    while (PREFIX.test(host)) host = host.replace(PREFIX, "");

    const label = host.split(".")[0];
    if (!label) return {};

    const company = label
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return { company: clean(company) };
  }

  function safe(name: string, layer: () => LayerResult): [string, LayerResult] {
    try {
      return [name, layer()];
    } catch (err) {
      console.debug(`[job-tracker] layer "${name}" failed`, err);
      return [name, {}];
    }
  }

  const layers: [string, LayerResult][] = [
    safe("jsonld", fromJsonLd),
    safe("meta", fromMeta),
    safe("title", fromTitle),
    safe("domain", fromDomain),
  ];

  const via: Record<string, string> = {};

  function pick(field: keyof LayerResult): string | undefined {
    for (const [name, result] of layers) {
      const value = result[field];
      if (!value) continue;
      if (field === "company" && isPlatformName(value)) continue;
      via[field] = name;
      return value;
    }
    return undefined;
  }

  const role = pick("role");
  const company = pick("company");
  const locationText = pick("location");
  const jobId = pick("jobId");

  console.debug("[job-tracker] extracted", { role, company, location: locationText, jobId }, "via", via);

  return {
    role,
    company,
    location: locationText,
    jobId,
    url: window.location.href,
    source: detectSource(window.location.hostname),
    capturedAt: Date.now(),
  };
}