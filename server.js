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
const { randomUUID, createHmac, timingSafeEqual } = require("node:crypto");
const mysql = require("mysql2/promise");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = /^[A-Za-z0-9_]+$/.test(process.env.DB_NAME || "") ? process.env.DB_NAME : "201ful";

const DAPUR_PASSWORD = process.env.DAPUR_PASSWORD || "OneHeart";
const DAPUR_COOKIE = "dapur_session";
const DAPUR_SESSION_MAX_AGE = 8 * 60 * 60;
const DAPUR_TOKEN = createHmac("sha256", "201ful-dapur-session")
  .update(DAPUR_PASSWORD)
  .digest("hex");

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

/* Error koneksi yang wajar terjadi sesaat (mis. MySQL restart) -> dicoba ulang. */
const TRANSIENT_DB_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_CON_COUNT_ERROR",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT"
]);

async function withDbRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_DB_CODES.has(error.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw lastError;
}

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

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bukti_transfer (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nama VARCHAR(80) NOT NULL,
    nominal BIGINT UNSIGNED NULL,
    catatan VARCHAR(300) NULL,
    mime VARCHAR(40) NOT NULL,
    size INT UNSIGNED NOT NULL,
    file_data MEDIUMBLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS donatur (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nama VARCHAR(80) NOT NULL,
    jumlah BIGINT UNSIGNED NOT NULL DEFAULT 0,
    pesan VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_donatur_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS pengaturan (
    nama VARCHAR(50) NOT NULL PRIMARY KEY,
    nilai VARCHAR(255) NOT NULL,
    diperbarui DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

async function ensureSchema() {
  for (const statement of SCHEMA_STATEMENTS) {
    await withDbRetry(() => pool.query(statement));
  }

  await withDbRetry(() =>
    pool.query(
      "INSERT INTO pengaturan (nama, nilai) VALUES ('target_donasi', '195800000'), ('donasi_awal', '43500000') ON DUPLICATE KEY UPDATE nama = nama"
    )
  );
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

const DAPUR_PAGES = new Set(["/dapur-lp201", "/dapur-lp201.html"]);

function serveStaticFile(req, res, filePath, startedAt) {
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
  const code = error && error.code ? error.code : "UNKNOWN";
  console.error(`[201ful] MySQL error (${code}): ${error && error.message}`);

  if (TRANSIENT_DB_CODES.has(code) || code === "PROTOCOL_CONNECTION_LOST") {
    sendJson(
      req,
      res,
      503,
      { ok: false, error: "Database sedang sibuk atau baru tersambung ulang. Coba kirim sekali lagi." },
      startedAt
    );
    return;
  }

  sendJson(req, res, 500, { ok: false, error: "Bukti transfer gagal diproses. Coba lagi." }, startedAt);
}

async function handleHealth(req, res, startedAt) {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    sendJson(
      req,
      res,
      200,
      { ok: true, database: DB_NAME, db: rows[0].ok === 1, time: new Date().toISOString() },
      startedAt
    );
  } catch (error) {
    console.error(`[201ful] health DB error (${error.code || "UNKNOWN"}): ${error.message}`);
    sendJson(req, res, 503, { ok: false, database: DB_NAME, db: false }, startedAt);
  }
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
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("Body terlalu besar");
        error.code = "TOO_LARGE";
        req.removeListener("data", onData);
        req.resume(); // buang sisa body supaya respons tetap terkirim
        reject(error);
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
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

  const declaredLength = Number(req.headers["content-length"] || 0);
  if (declaredLength && declaredLength > MAX_BODY_BYTES) {
    sendJson(
      req,
      res,
      413,
      { ok: false, error: "Ukuran gambar maksimal 8 MB. Kecilkan dulu fotonya, lalu kirim lagi." },
      startedAt
    );
    req.resume();
    return;
  }

  let body;
  try {
    body = await readRequestBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error && error.code === "TOO_LARGE") {
      sendJson(
        req,
        res,
        413,
        { ok: false, error: "Ukuran gambar maksimal 8 MB. Kecilkan dulu fotonya, lalu kirim lagi." },
        startedAt
      );
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

  await withDbRetry(() =>
    pool.execute(
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
    )
  );

  sendJson(req, res, 201, { ok: true, id, message: "Bukti transfer diterima." }, startedAt);
}

async function serveBuktiFile(req, res, id, startedAt) {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    notFound(req, res, startedAt);
    return;
  }

  const [rows] = await withDbRetry(() =>
    pool.execute("SELECT mime, file_data FROM bukti_transfer WHERE id = ? LIMIT 1", [id])
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
  const [rows] = await withDbRetry(() =>
    pool.query(
      "SELECT id, nama, nominal, catatan, mime, size, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at FROM bukti_transfer ORDER BY created_at DESC, id DESC"
    )
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

/* ---------------- Donatur & pengaturan donasi ---------------- */

async function readJsonBody(req, limit = 64 * 1024) {
  const raw = await readRequestBody(req, limit);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    const error = new Error("JSON tidak valid");
    error.code = "BAD_JSON";
    throw error;
  }
}

function normaliseJumlah(value) {
  const digits = String(value === undefined || value === null ? "" : value)
    .replace(/[^0-9]/g, "")
    .slice(0, 12);
  return digits ? Number(digits) : 0;
}

async function readDonasiSettings() {
  const [rows] = await withDbRetry(() => pool.query("SELECT nama, nilai FROM pengaturan"));
  const map = new Map(rows.map((row) => [row.nama, row.nilai]));
  const target = Number(map.get("target_donasi") || 0);
  const donasiAwal = Number(map.get("donasi_awal") || 0);
  const [sumRows] = await withDbRetry(() =>
    pool.query("SELECT COALESCE(SUM(jumlah), 0) AS total, COUNT(*) AS banyak FROM donatur")
  );
  const totalDonatur = Number(sumRows[0].total || 0);
  const terkumpul = donasiAwal + totalDonatur;

  return {
    target,
    donasiAwal,
    totalDonatur,
    terkumpul,
    persen: target > 0 ? Math.min(100, Math.round((terkumpul / target) * 100)) : 0
  };
}

async function listDonatur(req, res, startedAt) {
  const ringkasan = await readDonasiSettings();
  const [rows] = await withDbRetry(() =>
    pool.query(
      "SELECT id, nama, jumlah, pesan, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at FROM donatur ORDER BY created_at DESC, id DESC"
    )
  );

  const items = rows.map((row) => ({
    id: row.id,
    nama: row.nama,
    jumlah: String(row.jumlah || 0),
    pesan: row.pesan || "",
    at: row.created_at
  }));

  sendJson(req, res, 200, { ok: true, ...ringkasan, count: items.length, items }, startedAt);
}

async function createDonatur(req, res, startedAt) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(req, res, 400, { ok: false, error: "Data yang dikirim tidak valid." }, startedAt);
    return;
  }

  const nama = cleanText(body.nama, 80);
  if (!nama) {
    sendJson(req, res, 400, { ok: false, error: "Nama donatur wajib diisi." }, startedAt);
    return;
  }

  const jumlah = normaliseJumlah(body.jumlah);
  const pesan = cleanText(body.pesan, 500);
  const id = randomUUID();

  await withDbRetry(() =>
    pool.execute(
      "INSERT INTO donatur (id, nama, jumlah, pesan, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())",
      [id, nama, jumlah, pesan || null]
    )
  );

  sendJson(req, res, 201, { ok: true, id }, startedAt);
}

async function updateDonatur(req, res, id, startedAt) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(req, res, 400, { ok: false, error: "Data yang dikirim tidak valid." }, startedAt);
    return;
  }

  const nama = cleanText(body.nama, 80);
  if (!nama) {
    sendJson(req, res, 400, { ok: false, error: "Nama donatur wajib diisi." }, startedAt);
    return;
  }

  const jumlah = normaliseJumlah(body.jumlah);
  const pesan = cleanText(body.pesan, 500);

  const [result] = await withDbRetry(() =>
    pool.execute("UPDATE donatur SET nama = ?, jumlah = ?, pesan = ? WHERE id = ?", [
      nama,
      jumlah,
      pesan || null,
      id
    ])
  );

  if (!result.affectedRows) {
    sendJson(req, res, 404, { ok: false, error: "Donatur tidak ditemukan." }, startedAt);
    return;
  }

  sendJson(req, res, 200, { ok: true, id }, startedAt);
}

async function deleteDonatur(req, res, id, startedAt) {
  const [result] = await withDbRetry(() => pool.execute("DELETE FROM donatur WHERE id = ?", [id]));

  if (!result.affectedRows) {
    sendJson(req, res, 404, { ok: false, error: "Donatur tidak ditemukan." }, startedAt);
    return;
  }

  sendJson(req, res, 200, { ok: true }, startedAt);
}

async function updatePengaturan(req, res, startedAt) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(req, res, 400, { ok: false, error: "Data yang dikirim tidak valid." }, startedAt);
    return;
  }

  const target = normaliseJumlah(body.target);
  const donasiAwal = normaliseJumlah(body.donasiAwal);

  if (!target) {
    sendJson(req, res, 400, { ok: false, error: "Target donasi harus lebih dari 0." }, startedAt);
    return;
  }

  await withDbRetry(() =>
    pool.query(
      "INSERT INTO pengaturan (nama, nilai) VALUES ('target_donasi', ?), ('donasi_awal', ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai), diperbarui = UTC_TIMESTAMP()",
      [String(target), String(donasiAwal)]
    )
  );

  const ringkasan = await readDonasiSettings();
  sendJson(req, res, 200, { ok: true, ...ringkasan }, startedAt);
}

function methodNotAllowed(res, allow) {
  res.writeHead(405, {
    ...NO_CACHE_HEADERS,
    Allow: allow,
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("Method Not Allowed");
}

/* ---------------- Gerbang kata sandi halaman dapur ---------------- */

function readCookie(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isDapurAuthed(req) {
  const value = readCookie(req, DAPUR_COOKIE);
  return Boolean(value) && sameSecret(value, DAPUR_TOKEN);
}

function requireDapur(req, res, startedAt) {
  if (isDapurAuthed(req)) return true;
  sendJson(req, res, 401, { ok: false, error: "Halaman dapur terkunci. Isi kata sandi dulu." }, startedAt);
  return false;
}

async function handleDapurAuth(req, res, pathname, startedAt) {
  if (pathname === "/api/dapur/session") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      methodNotAllowed(res, "GET, HEAD");
      log(req, 405, startedAt);
      return;
    }
    sendJson(req, res, 200, { ok: true, auth: isDapurAuthed(req) }, startedAt);
    return;
  }

  if (pathname === "/api/dapur/login") {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      log(req, 405, startedAt);
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(req, res, 400, { ok: false, error: "Data yang dikirim tidak valid." }, startedAt);
      return;
    }

    const password = String(body.password === undefined || body.password === null ? "" : body.password);
    if (!password || !sameSecret(password, DAPUR_PASSWORD)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      sendJson(req, res, 401, { ok: false, error: "Kata sandi salah. Coba lagi." }, startedAt);
      return;
    }

    res.setHeader(
      "Set-Cookie",
      `${DAPUR_COOKIE}=${DAPUR_TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DAPUR_SESSION_MAX_AGE}`
    );
    sendJson(req, res, 200, { ok: true, auth: true }, startedAt);
    return;
  }

  if (pathname === "/api/dapur/logout") {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      log(req, 405, startedAt);
      return;
    }
    res.setHeader("Set-Cookie", `${DAPUR_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    sendJson(req, res, 200, { ok: true }, startedAt);
    return;
  }

  sendJson(req, res, 404, { ok: false, error: "Endpoint tidak ditemukan." }, startedAt);
}

function handleDonasiRoute(req, res, pathname, startedAt) {
  const itemPrefix = "/api/donatur/";

  if (pathname === "/api/donatur") {
    if (req.method === "POST") {
      if (!requireDapur(req, res, startedAt)) return;
      createDonatur(req, res, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      listDonatur(req, res, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    methodNotAllowed(res, "GET, HEAD, POST");
    log(req, 405, startedAt);
    return;
  }

  if (pathname.startsWith(itemPrefix)) {
    const id = pathname.slice(itemPrefix.length);
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      sendJson(req, res, 404, { ok: false, error: "Donatur tidak ditemukan." }, startedAt);
      return;
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      if (!requireDapur(req, res, startedAt)) return;
      updateDonatur(req, res, id, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    if (req.method === "DELETE") {
      if (!requireDapur(req, res, startedAt)) return;
      deleteDonatur(req, res, id, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    methodNotAllowed(res, "PUT, PATCH, DELETE");
    log(req, 405, startedAt);
    return;
  }

  if (pathname === "/api/pengaturan") {
    if (req.method === "PUT" || req.method === "POST") {
      if (!requireDapur(req, res, startedAt)) return;
      updatePengaturan(req, res, startedAt).catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      readDonasiSettings()
        .then((ringkasan) => sendJson(req, res, 200, { ok: true, ...ringkasan }, startedAt))
        .catch((error) => databaseError(req, res, error, startedAt));
      return;
    }
    methodNotAllowed(res, "GET, HEAD, PUT, POST");
    log(req, 405, startedAt);
    return;
  }

  sendJson(req, res, 404, { ok: false, error: "Endpoint tidak ditemukan." }, startedAt);
}

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const pathname = safePathname(req.url);

  if (pathname === "/api/health") {
    handleHealth(req, res, startedAt);
    return;
  }

  if (pathname.startsWith("/api/dapur/")) {
    handleDapurAuth(req, res, pathname, startedAt).catch((error) => databaseError(req, res, error, startedAt));
    return;
  }

  if (
    pathname === "/api/donatur" ||
    pathname.startsWith("/api/donatur/") ||
    pathname === "/api/pengaturan"
  ) {
    handleDonasiRoute(req, res, pathname, startedAt);
    return;
  }

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

  const normalizedPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (normalizedPath === "/dapur-lp201/donatur") {
    res.writeHead(302, { ...NO_CACHE_HEADERS, Location: "/dapur-lp201" });
    res.end();
    log(req, 302, startedAt);
    return;
  }

  if (DAPUR_PAGES.has(normalizedPath) && !isDapurAuthed(req)) {
    serveStaticFile(req, res, path.join(ROOT, "dapur-login.html"), startedAt);
    return;
  }

  const filePath = resolveFile(req.url || "/");
  if (!filePath) {
    notFound(req, res, startedAt);
    return;
  }

  serveStaticFile(req, res, filePath, startedAt);
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
