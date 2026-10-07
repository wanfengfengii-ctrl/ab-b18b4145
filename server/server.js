import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PLASMID } from "./data.js";
import { validateAnnotations } from "./validate.js";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const MAX_BODY_BYTES = 1_000_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const STATUS_FOR_CODE = {
  INVALID_PAYLOAD: 400,
  INVALID_ANNOTATION: 400,
  EMPTY_NAME: 400,
  INVALID_COORDINATES: 400,
  EMPTY_FRAGMENT: 400,
  FULL_CIRCLE: 400,
  DUPLICATE_NAME: 409
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(WEB_ROOT, rel));
  if (!filePath.startsWith(WEB_ROOT + path.sep) && filePath !== path.join(WEB_ROOT, "index.html")) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export function createServer(initial) {
  // 内存状态：注释集合整体替换（单次赋值 = 原子提交）。
  const state = {
    annotations: (initial?.annotations ?? PLASMID.annotations).map((a) => ({ ...a }))
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok" }));
    }

    if (req.method === "GET" && pathname === "/api/plasmid") {
      return sendJson(res, 200, {
        name: PLASMID.name,
        length: PLASMID.length,
        circular: PLASMID.circular,
        referenceStart: PLASMID.referenceStart,
        annotations: state.annotations
      });
    }

    if (req.method === "PUT" && pathname === "/api/annotations") {
      let raw;
      try {
        raw = await readBody(req);
      } catch {
        return sendJson(res, 413, { error: { code: "INVALID_PAYLOAD", message: "请求体过大" } });
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: { code: "INVALID_PAYLOAD", message: "请求体不是合法 JSON" } });
      }
      const result = validateAnnotations(parsed, PLASMID.length);
      if (result.error) {
        // 校验失败：直接返回，state.annotations 从未被触碰。
        return sendJson(res, STATUS_FOR_CODE[result.error.code] ?? 400, result);
      }
      state.annotations = result.value; // 原子提交完整集合
      return sendJson(res, 200, { ok: true, annotations: state.annotations });
    }

    if (req.method === "GET") {
      return serveStatic(res, pathname);
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => {
    console.log(`plasmid server listening on :${port}`);
  });
}
