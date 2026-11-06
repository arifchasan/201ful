"use strict";

/**
 * 201FUL / LP201 — static file server.
 * - Default port 3001 (override with PORT)
 * - Every response is sent with no-store headers so edits appear immediately
 * - Serves clean URLs (/tim -> tim.html) and blocks dotfiles / node_modules
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm"
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

const NOT_FOUND_BODY = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Halaman tidak ditemukan · 201FUL</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f7fc; color: #0a3876; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; padding: 24px; }
  h1 { font-size: 2rem; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #4c6a93; }
  a { display: inline-block; padding: 12px 22px; border-radius: 999px; background: #0a3876; color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
  <main>
    <h1>404</h1>
    <p>Halaman yang kamu cari tidak ada di 201FUL.</p>
    <a href="/">Kembali ke beranda</a>
  </main>
</body>
</html>
`;

function log(req, status, startedAt) {
  const ms = Date.now() - startedAt;
  console.log(`${req.method} ${req.url} ${status} ${ms}ms`);
}

function notFound(req, res, startedAt) {
  const body = Buffer.from(NOT_FOUND_BODY, "utf8");
  res.writeHead(404, {
    ...NO_CACHE_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(body);
  }
  log(req, 404, startedAt);
}

/** Map a request URL to a file inside ROOT, or null when it is not allowed. */
function resolveFile(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }

  if (pathname.includes("\0")) return null;
  if (pathname.endsWith("/")) pathname += "index.html";
  if (!path.extname(pathname)) pathname += ".html";

  const filePath = path.resolve(ROOT, "." + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return null;

  const segments = path.relative(ROOT, filePath).split(path.sep);
  if (segments.some((segment) => segment.startsWith(".") || segment === "node_modules")) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  const startedAt = Date.now();

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      ...NO_CACHE_HEADERS,
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Method Not Allowed");
    log(req, 405, startedAt);
    return;
  }

  const filePath = resolveFile(req.url || "/");
  if (!filePath) {
    notFound(req, res, startedAt);
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      notFound(req, res, startedAt);
      return;
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      ...NO_CACHE_HEADERS,
      "Content-Type": type,
      "Content-Length": stat.size
    });

    if (req.method === "HEAD") {
      res.end();
      log(req, 200, startedAt);
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      res.destroy();
      log(req, 500, startedAt);
    });
    res.on("close", () => stream.destroy());
    res.on("finish", () => log(req, 200, startedAt));
    stream.pipe(res);
  });
});

server.on("error", (error) => {
  console.error(`[201ful] server error: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[201ful] serving ${ROOT} on http://${HOST}:${PORT} (cache disabled)`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[201ful] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
