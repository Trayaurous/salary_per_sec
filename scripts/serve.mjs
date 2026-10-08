import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); res.end("Bad request"); return; }
  // Also expose /salary_per_sec/ to verify the GitHub Pages project path locally.
  if (pathname.startsWith("/salary_per_sec/")) pathname = pathname.slice("/salary_per_sec".length);
  if (pathname.endsWith("/")) pathname += "index.html";
  const filename = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.startsWith(".git") || relative.startsWith(".codex")) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(filename).pipe(res);
  });
});
server.listen(port, "127.0.0.1", () => console.log(`秒薪计算器：http://127.0.0.1:${port}/salary_per_sec/`));
