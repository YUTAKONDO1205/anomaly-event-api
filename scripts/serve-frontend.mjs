import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";

const host = "127.0.0.1";
const port = 4173;
const rootDir = path.join(process.cwd(), "frontend");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function resolveRequestPath(requestUrl) {
  const pathname = new URL(requestUrl, `http://${host}:${port}`).pathname;
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  return path.join(rootDir, relativePath);
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = resolveRequestPath(request.url ?? "/");
    const normalizedRoot = path.resolve(rootDir);
    const normalizedFile = path.resolve(filePath);

    if (!normalizedFile.startsWith(normalizedRoot)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    await fs.access(normalizedFile);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(normalizedFile)] ?? "text/plain; charset=utf-8"
    });
    createReadStream(normalizedFile).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Frontend available at http://${host}:${port}`);
});
