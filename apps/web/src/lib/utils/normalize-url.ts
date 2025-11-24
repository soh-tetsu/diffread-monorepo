const defaultProtocol = "https:";

function ensureProtocol(rawUrl: string): string {
  if (/^[a-zA-Z]+:\/\//.test(rawUrl)) {
    return rawUrl;
  }
  return `https://${rawUrl}`;
}

function trimTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "");
}

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(ensureProtocol(rawUrl));
  url.protocol = url.protocol || defaultProtocol;
  url.hash = "";
  url.searchParams.sort();
  url.pathname = trimTrailingSlash(url.pathname) || "/";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  return url.toString();
}
