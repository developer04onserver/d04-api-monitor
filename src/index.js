export async function checkEndpoint(url, { timeoutMs = 5000, expectedStatus = 200, fetchImpl = fetch, method = "GET" } = {}) {
  const controller = new AbortController(); const started = performance.now(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method, signal: controller.signal });
    const latencyMs = Math.round((performance.now() - started) * 100) / 100;
    return { url, ok: response.status === expectedStatus, status: response.status, expectedStatus, latencyMs, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { url, ok: false, status: null, expectedStatus, latencyMs: Math.round((performance.now() - started) * 100) / 100, error: error.name === "AbortError" ? "timeout" : error.message, checkedAt: new Date().toISOString() };
  } finally { clearTimeout(timer); }
}
export async function runChecks(targets, options = {}) {
  const concurrency = Math.max(1, options.concurrency ?? 5); const results = new Array(targets.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (cursor < targets.length) { const index = cursor++; const target = targets[index]; results[index] = await checkEndpoint(target.url, { ...options, ...target }); }
  }));
  return { total: results.length, healthy: results.filter(x => x.ok).length, unhealthy: results.filter(x => !x.ok).length, results };
}
export class MonitorHistory {
  constructor(maxEntries = 500) { this.maxEntries = maxEntries; this.records = []; }
  add(result) { this.records.push(result); if (this.records.length > this.maxEntries) this.records.splice(0, this.records.length - this.maxEntries); }
  summary(url) {
    const rows = this.records.filter(r => !url || r.url === url); const healthy = rows.filter(r => r.ok).length;
    const latencies = rows.filter(r => Number.isFinite(r.latencyMs)).map(r => r.latencyMs).sort((a,b) => a-b);
    return { samples: rows.length, uptimePercent: rows.length ? healthy / rows.length * 100 : null, averageLatencyMs: latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : null, p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length-1, Math.ceil(latencies.length*.95)-1)] : null };
  }
}