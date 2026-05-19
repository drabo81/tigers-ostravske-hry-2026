export const PROXY_BUILDERS = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

const DEFAULT_TIMEOUT_MS = 8_000;

export async function fetchViaProxy(targetUrl, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const errors = [];
  for (const builder of PROXY_BUILDERS) {
    const proxyUrl = builder(targetUrl);
    try {
      const response = await fetchImpl(proxyUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        errors.push(`${proxyUrl}: HTTP ${response.status}`);
        continue;
      }
      return await response.text();
    } catch (e) {
      errors.push(`${proxyUrl}: ${e.message}`);
    }
  }
  throw new Error(`all proxies failed: ${errors.join(' | ')}`);
}
