"use strict";

/**
 * 201FUL / LP201 — static file server + API bukti transfer.
 * - Default port 3001 (override with PORT)
 * - Every response is sent with no-store headers so edits appear immediately
 * - Serves clean URLs (/tim -> tim.html) and blocks dotfiles / node_modules / storage
 * - Bukti transfer disimpan di MySQL (default: database 201ful, tabel bukti_transfer)
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mysql = require("mysql2/promise");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = /^[A-Za-z0-9_]+$/.test(process.env.DB_NAME || "") ? process.env.DB_NAME : "201ful";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024;

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  timezone: "Z",
  supportBigNumbers: true
});

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bukti_transfer (
      id CHAR(36) NOT NULL PRIMARY KEY,
      nama VARCHAR(80) NOT NULL,
      nominal BIGINT UNSIGNED NULL,
      catatan VARCHAR(300) NULL,
      mime VARCHAR(40) NOT NULL,
      size INT UNSIGNED NOT NULL,
      file_data MEDIUMBLOB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

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
  if (segments.some((segment) => segment.startsWith(".") || segment === "node_modules" || segment === "storage")) {
    return null;
  }

  return filePath;
}

/* ---------------- Bukti transfer: MySQL + endpoint ---------------- */

function safePathname(rawUrl) {
  try {
    return decodeURIComponent(new URL(rawUrl || "/", "http://localhost").pathname);
  } catch {
    return "";
  }
}

function sendJson(req, res, status, payload, startedAt) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    ...NO_CACHE_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(body);
  }
  log(req, status, startedAt);
}

function databaseError(req, res, error, startedAt) {
  console.error(`[201ful] MySQL error: ${error.message}`);
  sendJson(
    req,
    res,
    503,
    { ok: false, error: "Layanan database sedang tidak tersedia. Coba lagi sebentar." },
    startedAt
  );
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function detectImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  if (buffer[0] === 0x89 && buffer.slice(1, 4).toString("latin1") === "PNG") {
    return { ext: ".png", mime: "image/png" };
  }
  if (buffer.slice(0, 4).toString("latin1") === "RIFF" && buffer.slice(8, 12).toString("latin1") === "WEBP") {
    return { ext: ".webp", mime: "image/webp" };
  }
  if (buffer.slice(0, 3).toString("latin1") === "GIF") {
    return { ext: ".gif", mime: "image/gif" };
  }
  return null;
}

function parseMultipart(buffer, boundary) {
  const fields = Object.create(null);
  const files = Object.create(null);
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);

  while (cursor !== -1) {
    let start = cursor + delimiter.length;
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break; // penutup "--"
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    const end = buffer[next - 2] === 0x0d && buffer[next - 1] === 0x0a ? next - 2 : next;
    const part = buffer.subarray(start, end);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4);
      const nameMatch = /;\s*name="([^"]*)"/i.exec(headerText);
      if (nameMatch) {
        const filenameMatch = /;\s*filename="([^"]*)"/i.exec(headerText);
        if (filenameMatch) {
          files[nameMatch[1]] = { filename: filenameMatch[1], body: Buffer.from(content) };
        } else {
          fields[nameMatch[1]] = content.toString("utf8");
        }
      }
    }
    cursor = next;
  }

  return { fields, files };
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("Body terlalu besar");
        error.code = "TOO_LARGE";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleUpload(req, res, startedAt) {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);

  if (!contentType.toLowerCase().startsWith("multipart/form-data") || !boundaryMatch) {
    sendJson(req, res, 415, { ok: false, error: "Format kiriman harus multipart/form-data." }, startedAt);
    return;
  }

  let body;
  try {
    body = await readRequestBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error && error.code === "TOO_LARGE") {
      sendJson(req, res, 413, { ok: false, error: "Ukuran gambar maksimal 8 MB." }, startedAt);
      return;
    }
    sendJson(req, res, 400, { ok: false, error: "Kiriman gagal dibaca, coba lagi." }, startedAt);
    return;
  }

  const boundary = (boundaryMatch[1] || boundaryMatch[2] || "").trim();
  const { fields, files } = parseMultipart(body, boundary);
  const file = files.bukti || files.file;

  if (!file || !file.body || !file.body.length) {
    sendJson(req, res, 400, { ok: false, error: "Foto bukti transfer belum dipilih." }, startedAt);
    return;
  }

  const detected = detectImage(file.body);
  if (!detected) {
    sendJson(req, res, 415, { ok: false, error: "File harus berupa gambar JPG, PNG, WEBP, atau GIF." }, startedAt);
    return;
  }

  if (file.body.length > MAX_IMAGE_BYTES) {
    sendJson(req, res, 413, { ok: false, error: "Ukuran gambar maksimal 8 MB." }, startedAt);
    return;
  }

  const nama = cleanText(fields.nama, 80);
  if (!nama) {
    sendJson(req, res, 400, { ok: false, error: "Nama donatur wajib diisi." }, startedAt);
    return;
  }

  const nominal = cleanText(fields.nominal, 20).replace(/[^0-9]/g, "").slice(0, 12);
  const catatan = cleanText(fields.catatan, 300);
  const id = randomUUID();

  await pool.execute(
    "INSERT INTO bukti_transfer (id, nama, nominal, catatan, mime, size, file_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
    [
      id,
      nama,
      nominal ? Number(nominal) : null,
      catatan || null,
      detected.mime,
      file.body.length,
      file.body
    ]
  );

  sendJson(req, res, 201, { ok: true, id, message: "Bukti transfer diterima." }, startedAt);
}

async function serveBuktiFile(req, res, id, startedAt) {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    notFound(req, res, startedAt);
    return;
  }

  const [rows] = await pool.execute(
    "SELECT mime, file_data FROM bukti_transfer WHERE id = ? LIMIT 1",
    [id]
  );

  if (!rows.length) {
    notFound(req, res, startedAt);
    return;
  }

  const data = rows[0].file_data;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  res.writeHead(200, {
    ...NO_CACHE_HEADERS,
    "Content-Type": rows[0].mime || "application/octet-stream",
    "Content-Length": buffer.length,
    "Content-Disposition": "inline"
  });

  if (req.method === "HEAD") {
    res.end();
    log(req, 200, startedAt);
    return;
  }

  res.end(buffer);
  log(req, 200, startedAt);
}

async function listBukti(req, res, startedAt) {
  const filePrefix = "/api/bukti-transfer/file/";
  const [rows] = await pool.query(
    "SELECT id, nama, nominal, catatan, mime, size, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at FROM bukti_transfer ORDER BY created_at DESC, id DESC"
  );

  const items = rows.map((row) => ({
    id: row.id,
    nama: row.nama,
    nominal: row.nominal === null ? "" : String(row.nominal),
    catatan: row.catatan || "",
    at: row.created_at,
    mime: row.mime,
    size: row.size,
    url: `${filePrefix}${row.id}`
  }));

  sendJson(req, res, 200, { ok: true, count: items.length, items }, startedAt);
}

function handleBuktiRoute(req, res, pathname, startedAt) {
  const filePrefix = "/api/bukti-transfer/file/";

  if (pathname === "/api/bukti-transfer") {
    if (req.method === "POST") {
      handleUpload(req, res, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      listBukti(req, res, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    res.writeHead(405, {
      ...NO_CACHE_HEADERS,
      Allow: "GET, HEAD, POST",
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Method Not Allowed");
    log(req, 405, startedAt);
    return;
  }

  if (pathname.startsWith(filePrefix)) {
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
    serveBuktiFile(req, res, pathname.slice(filePrefix.length), startedAt).catch((error) =>
      databaseError(req, res, error, startedAt)
    );
    return;
  }

  sendJson(req, res, 404, { ok: false, error: "Endpoint tidak ditemukan." }, startedAt);
}

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const pathname = safePathname(req.url);

  if (pathname === "/api/bukti-transfer" || pathname.startsWith("/api/bukti-transfer/")) {
    handleBuktiRoute(req, res, pathname, startedAt);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(req, res, 404, { ok: false, error: "Endpoint tidak ditemukan." }, startedAt);
    return;
  }

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

ensureDatabase()
  .then(ensureSchema)
  .then(() => console.log(`[201ful] MySQL siap: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`))
  .catch((error) => console.error(`[201ful] MySQL belum siap: ${error.message}`));

server.listen(PORT, HOST, () => {
  console.log(`[201ful] serving ${ROOT} on http://${HOST}:${PORT} (cache disabled)`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[201ful] ${signal} received, shutting down`);
    server.close(() => {
      pool.end().catch(() => {}).finally(() => process.exit(0));
    });
  });
}
