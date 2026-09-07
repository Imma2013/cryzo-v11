import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 1_500_000;
const MAX_CSS_BYTES = 300_000;
const MAX_TOTAL_CSS_BYTES = 1_000_000;
const MAX_STYLESHEETS = 10;
const MAX_REDIRECTS = 5;

type ImportedFile = { path: string; content: string };

function isPrivateAddress(address: string) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("ff") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

async function validatePublicUrl(input: string | URL) {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website URL must use http or https.");
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Local and private network URLs cannot be imported.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private network URLs cannot be imported.");
    return url;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("This hostname resolves to a private or unsupported network address.");
  }
  return url;
}

async function safeFetch(input: string | URL, accept: string) {
  let url = await validatePublicUrl(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: accept,
        "User-Agent": "Mozilla/5.0 (compatible; CryzoWebsiteImporter/1.0; +https://cryzo.me)",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website returned an invalid redirect.");
      url = await validatePublicUrl(new URL(location, url));
      continue;
    }
    return { response, url };
  }
  throw new Error("Website redirected too many times.");
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function rewriteCssUrls(css: string, stylesheetUrl: URL) {
  return css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (match, quote: string, rawValue: string) => {
      const value = rawValue.trim();
      if (!value || /^(data:|blob:|https?:|\/\/|#)/i.test(value)) return match;
      try {
        const absolute = new URL(value, stylesheetUrl).toString();
        return `url(${quote}${absolute}${quote})`;
      } catch {
        return match;
      }
    },
  );
}

function pageTitle(html: string, fallback: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (title || fallback).slice(0, 80);
}

function sanitizeProjectName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imported-website"
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    if (!body.url?.trim()) {
      return Response.json({ error: "Enter a website URL to import." }, { status: 400 });
    }

    let requestedUrl: URL;
    try {
      requestedUrl = new URL(body.url.trim().match(/^https?:\/\//i) ? body.url.trim() : `https://${body.url.trim()}`);
    } catch {
      return Response.json({ error: "Enter a valid website URL." }, { status: 400 });
    }

    const { response, url: finalUrl } = await safeFetch(requestedUrl, "text/html,application/xhtml+xml");
    if (!response.ok) {
      return Response.json({ error: `Website returned HTTP ${response.status}.` }, { status: 422 });
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return Response.json({ error: "That URL did not return an HTML page." }, { status: 422 });
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) {
      return Response.json({ error: "Website HTML is too large to import." }, { status: 413 });
    }

    let html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return Response.json({ error: "Website HTML is too large to import." }, { status: 413 });
    }

    const title = pageTitle(html, finalUrl.hostname);
    const warnings: string[] = [
      "This is a remix import of the deployed page, not the website's private React/Next source code.",
    ];

    // Do not execute third-party application bundles, trackers, service workers, or inline scripts.
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<script\b[^>]*\/?>/gi, "");
    html = html.replace(/<meta\b[^>]*http-equiv=["']?(?:content-security-policy|refresh)["']?[^>]*>/gi, "");

    const stylesheetTags = Array.from(
      html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi),
    )
      .map((match) => ({
        tag: match[0],
        href: match[0].match(/href=["']([^"']+)["']/i)?.[1],
      }))
      .filter((entry): entry is { tag: string; href: string } => Boolean(entry.href))
      .slice(0, MAX_STYLESHEETS);

    const files: ImportedFile[] = [];
    let totalCssBytes = 0;
    let importedStyles = 0;

    for (const entry of stylesheetTags) {
      try {
        const stylesheetUrl = new URL(entry.href, finalUrl);
        const result = await safeFetch(stylesheetUrl, "text/css,*/*;q=0.1");
        if (!result.response.ok) throw new Error(`HTTP ${result.response.status}`);
        const css = await result.response.text();
        const bytes = Buffer.byteLength(css, "utf8");
        if (bytes > MAX_CSS_BYTES || totalCssBytes + bytes > MAX_TOTAL_CSS_BYTES) {
          warnings.push(`Skipped oversized stylesheet: ${stylesheetUrl.hostname}${stylesheetUrl.pathname}`);
          continue;
        }
        totalCssBytes += bytes;
        const localPath = `styles/imported-${importedStyles}.css`;
        files.push({
          path: localPath,
          content: `/* Imported from ${result.url.toString()} */\n${rewriteCssUrls(css, result.url)}`,
        });
        html = html.replace(entry.tag, `<link rel="stylesheet" href="/${localPath}">`);
        importedStyles++;
      } catch {
        warnings.push(`Could not localize stylesheet: ${entry.href}`);
      }
    }

    const baseHref = finalUrl.toString();
    if (!/<base\b/i.test(html)) {
      const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
      if (/<head\b[^>]*>/i.test(html)) {
        html = html.replace(/<head\b[^>]*>/i, (head) => `${head}\n    ${baseTag}`);
      } else {
        html = `${baseTag}\n${html}`;
      }
    }

    files.unshift({ path: "index.html", content: html });
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: sanitizeProjectName(title),
          private: true,
          scripts: {
            dev: "vite --host 0.0.0.0",
            build: "vite build",
          },
          devDependencies: {
            vite: "5.4.21",
          },
        },
        null,
        2,
      ),
    });
    files.push({
      path: "README.md",
      content: `# ${title}\n\nImported into Cryzo from ${finalUrl.toString()} as an editable deployed-page remix. External images, fonts, and links may continue to load from the original site until you replace them.\n`,
    });

    return Response.json({
      title,
      files,
      startCommand: "npm run dev",
      warnings,
      source: finalUrl.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}
