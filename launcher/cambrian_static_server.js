const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".bmp", "image/bmp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"]
]);

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 5500,
    root: process.cwd()
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--host" || arg === "-h") && argv[index + 1]) {
      options.host = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if ((arg === "--port" || arg === "-p") && argv[index + 1]) {
      options.port = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if ((arg === "--root" || arg === "-r") && argv[index + 1]) {
      options.root = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return options;
}

function send(res, statusCode, headers, body, isHead) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers
  });

  if (isHead || body == null) {
    res.end();
    return;
  }

  res.end(body);
}

function safeDecode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function resolvePath(rootPath, requestPath) {
  const decoded = safeDecode(requestPath);
  if (decoded == null) {
    return null;
  }

  const normalizedRequest = decoded.split("?")[0].split("#")[0];
  const trimmed = normalizedRequest.replace(/^\/+/, "");
  const candidate = path.normalize(path.join(rootPath, trimmed));
  const relative = path.relative(rootPath, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return candidate;
}

async function statIfExists(targetPath) {
  try {
    return await fsp.stat(targetPath);
  } catch {
    return null;
  }
}

async function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES.get(ext) || "application/octet-stream";

  if (req.method === "HEAD") {
    send(
      res,
      200,
      {
        "Content-Type": contentType,
        "Content-Length": stat.size
      },
      null,
      true
    );
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Read error", false);
      return;
    }
    res.end();
  });

  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Content-Length": stat.size
  });
  stream.pipe(res);
}

async function handleRequest(req, res, rootPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { "Content-Type": "text/plain; charset=utf-8" }, "Method Not Allowed", req.method === "HEAD");
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const resolvedPath = resolvePath(rootPath, requestUrl.pathname || "/");
  if (!resolvedPath) {
    send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request", req.method === "HEAD");
    return;
  }

  let targetPath = resolvedPath;
  let stat = await statIfExists(targetPath);

  if (stat && stat.isDirectory()) {
    targetPath = path.join(targetPath, "index.html");
    stat = await statIfExists(targetPath);
  }

  if (!stat || !stat.isFile()) {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found", req.method === "HEAD");
    return;
  }

  await serveFile(req, res, targetPath, stat);
}

function main() {
  const options = parseArgs(process.argv);
  if (!Number.isInteger(options.port) || options.port <= 0 || options.port >= 65536) {
    console.error("[CambrianLauncher] Invalid port.");
    process.exit(2);
  }

  const rootPath = path.resolve(options.root);
  const server = http.createServer((req, res) => {
    handleRequest(req, res, rootPath).catch((error) => {
      const message = error && error.message ? error.message : String(error);
      send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, message, req.method === "HEAD");
    });
  });

  server.on("error", (error) => {
    if (error && error.code === "EADDRINUSE") {
      console.error(`[CambrianLauncher] Port ${options.port} is already in use.`);
      process.exit(1);
    }

    console.error("[CambrianLauncher] Server error:", error);
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(options.port, options.host, () => {
    console.log(`[CambrianLauncher] Static server running at http://${options.host}:${options.port}/`);
    console.log(`[CambrianLauncher] Root: ${rootPath}`);
  });
}

main();
