// 容器健康检查：命中 /healthz 即退出 0。供 Dockerfile HEALTHCHECK 与 Compose healthcheck 使用。
const base = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS ?? 2500);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const res = await fetch(`${base}/healthz`, { signal: controller.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  process.exit(0);
} catch (err) {
  console.error(`healthcheck failed: ${err.message}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
