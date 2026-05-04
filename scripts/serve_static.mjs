import http from "http";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSET_VERSION = String(Date.now());

function parseArgs(argv) {
  const args = { host: "127.0.0.1", port: 5500, root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host" && argv[i + 1]) {
      args.host = String(argv[++i]);
    } else if (a === "--port" && argv[i + 1]) {
      args.port = Number(argv[++i]);
    } else if (a === "--root" && argv[i + 1]) {
      args.root = String(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
]);

function addAssetVersionToRelativeSpecifier(specifier, version) {
  const text = String(specifier || "");
  if (!text.startsWith("./") && !text.startsWith("../")) return text;
  if (/(^|[?&])v=/.test(text)) return text;
  return text.includes("?") ? `${text}&v=${version}` : `${text}?v=${version}`;
}

function rewriteModuleImports(text, version) {
  if (!text) return text;

  const replacer = (_full, prefix, specifier, suffix) => `${prefix}${addAssetVersionToRelativeSpecifier(specifier, version)}${suffix}`;

  return String(text)
    .replace(/((?:^|\n)\s*import\s*["'])(\.\.?\/[^"'\r\n]+)(["'])/gm, replacer)
    .replace(/(\bfrom\s*["'])(\.\.?\/[^"'\r\n]+)(["'])/gm, replacer)
    .replace(/(\bimport\s*\(\s*["'])(\.\.?\/[^"'\r\n]+)(["']\s*\))/gm, replacer);
}

function shouldRewriteModuleImports(fsPath) {
  const ext = path.extname(fsPath).toLowerCase();
  return ext === ".js" || ext === ".mjs";
}

function send(res, status, headers, body) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  if (body == null) {
    res.end();
  } else if (typeof body === "string" || Buffer.isBuffer(body)) {
    res.end(body);
  } else {
    res.end(String(body));
  }
}

function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function toFsPath(rootAbs, urlPathname) {
  const decoded = safeDecodeURIComponent(urlPathname);
  if (decoded == null) return null;

  const withoutQuery = decoded.split("?")[0].split("#")[0];
  const stripped = withoutQuery.replace(/^\/+/, "");
  const joined = path.join(rootAbs, stripped);
  const normalized = path.normalize(joined);

  const rel = path.relative(rootAbs, normalized);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return normalized;
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

async function buildDirectoryListingHtml(urlPathname, dirFsPath) {
  const entries = await fsp.readdir(dirFsPath, { withFileTypes: true });

  // Keep a python-http.server-like simple listing with href="..."
  const title = `Directory listing for ${urlPathname}`;

  const items = [];

  // parent link
  if (urlPathname !== "/") {
    items.push('<li><a href="../">../</a></li>');
  }

  const sorted = entries
    .map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, "en");
    });

  for (const e of sorted) {
    const display = e.isDir ? `${e.name}/` : e.name;
    const href = encodeURIComponent(e.name) + (e.isDir ? "/" : "");
    items.push(`<li><a href="${href}">${htmlEscape(display)}</a></li>`);
  }

  return (
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">\n' +
    "<html>\n" +
    " <head>\n" +
    `  <title>${htmlEscape(title)}</title>\n` +
    " </head>\n" +
    " <body>\n" +
    `  <h1>${htmlEscape(title)}</h1>\n` +
    "  <hr>\n" +
    "  <ul>\n" +
    items.map((x) => `   ${x}`).join("\n") +
    "\n  </ul>\n" +
    "  <hr>\n" +
    " </body>\n" +
    "</html>\n"
  );
}

async function handleRequest(req, res, rootAbs) {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const urlPathname = urlObj.pathname || "/";

  const fsPath = toFsPath(rootAbs, urlPathname);
  if (!fsPath) {
    return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request");
  }

  let st;
  try {
    st = await fsp.stat(fsPath);
  } catch {
    return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
  }

  if (st.isDirectory()) {
    if (!urlPathname.endsWith("/")) {
      return send(res, 301, { Location: `${urlPathname}/` }, "");
    }

    const indexHtml = path.join(fsPath, "index.html");
    try {
      const indexStat = await fsp.stat(indexHtml);
      if (indexStat.isFile()) {
        const stream = fs.createReadStream(indexHtml);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        stream.pipe(res);
        return;
      }
    } catch {
      // fall through to listing
    }

    let html;
    try {
      html = await buildDirectoryListingHtml(urlPathname, fsPath);
    } catch (e) {
      return send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, String(e?.message || e));
    }
    return send(res, 200, { "Content-Type": "text/html; charset=utf-8" }, html);
  }

  if (!st.isFile()) {
    return send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
  }

  const ext = path.extname(fsPath).toLowerCase();
  const type = MIME.get(ext) || "application/octet-stream";

  if (shouldRewriteModuleImports(fsPath)) {
    try {
      const text = await fsp.readFile(fsPath, "utf8");
      const rewritten = rewriteModuleImports(text, ASSET_VERSION);
      return send(res, 200, { "Content-Type": type }, rewritten);
    } catch {
      return send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Read error");
    }
  }

  const stream = fs.createReadStream(fsPath);
  stream.on("error", () => {
    if (!res.headersSent) {
      send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Read error");
    } else {
      res.end();
    }
  });

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": st.size,
    "Cache-Control": "no-store",
  });

  stream.pipe(res);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("CambridgeCity local server");
    console.log("Usage: node scripts/serve_static.mjs --host 127.0.0.1 --port 5500 [--root <path>]");
    process.exit(0);
  }

  if (!Number.isFinite(args.port) || args.port <= 0 || args.port >= 65536) {
    console.error("Invalid --port");
    process.exit(2);
  }

  const rootAbs = path.resolve(args.root);
  const server = http.createServer((req, res) => {
    handleRequest(req, res, rootAbs).catch((e) => {
      send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, String(e?.message || e));
    });
  });

  server.on("error", (err) => {
    console.error("[CambridgeCity] server error:", err);
    process.exit(1);
  });

  server.listen(args.port, args.host, () => {
    console.log(`[CambridgeCity] Static server running: http://${args.host}:${args.port}/`);
    console.log(`[CambridgeCity] Root: ${rootAbs}`);
    console.log(`[CambridgeCity] Asset version: ${ASSET_VERSION}`);
    console.log("[CambridgeCity] Press Ctrl+C to stop.");
  });
}

main();
