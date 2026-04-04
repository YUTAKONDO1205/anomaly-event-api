import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const host = "127.0.0.1";
const port = 3000;
const repoRoot = process.cwd();
const frontendRoot = path.join(repoRoot, "frontend");

process.env.APP_STORAGE_MODE = process.env.APP_STORAGE_MODE || "local";
process.env.DETECTION_PROVIDER = process.env.DETECTION_PROVIDER || "heuristic";
process.env.EVENTS_TABLE = process.env.EVENTS_TABLE || "local-events";
process.env.EVENT_IMAGES_BUCKET = process.env.EVENT_IMAGES_BUCKET || "local-uploads";
process.env.LOCAL_UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR || "local-storage/uploads";
process.env.LOCAL_EVENTS_FILE = process.env.LOCAL_EVENTS_FILE || "local-storage/events/events.json";
process.env.DETECTION_TARGET_LABEL = process.env.DETECTION_TARGET_LABEL || "Positive";
process.env.DETECTION_MIN_CONFIDENCE = process.env.DETECTION_MIN_CONFIDENCE || "50";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const handlerModules = {
  createEvent: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/createEvent.js")).href),
  getEvents: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/getEvents.js")).href),
  getEventById: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/getEventById.js")).href),
  updateEventStatus: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/updateEventStatus.js")).href),
  getUploadUrl: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/getUploadUrl.js")).href),
  detectImage: () => import(pathToFileURL(path.join(repoRoot, "dist/handlers/detectImage.js")).href)
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function resolveStaticFile(url) {
  const pathname = new URL(url, `http://${host}:${port}`).pathname;
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  return path.join(frontendRoot, relativePath);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseQuery(url) {
  const searchParams = new URL(url, `http://${host}:${port}`).searchParams;
  const result = {};

  for (const [key, value] of searchParams.entries()) {
    result[key] = value;
  }

  return result;
}

function buildEvent(request, body, pathParameters = {}) {
  const url = new URL(request.url, `http://${host}:${port}`);

  return {
    version: "2.0",
    routeKey: `${request.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
    headers: request.headers,
    queryStringParameters: Object.keys(parseQuery(request.url)).length > 0 ? parseQuery(request.url) : undefined,
    pathParameters: Object.keys(pathParameters).length > 0 ? pathParameters : undefined,
    requestContext: {
      http: {
        method: request.method,
        path: url.pathname
      }
    },
    body,
    isBase64Encoded: false
  };
}

async function runHandler(loader, request, response, pathParameters = {}) {
  try {
    const body = await readRequestBody(request);
    const mod = await loader();
    const result = await mod.handler(buildEvent(request, body || null, pathParameters));

    response.writeHead(result.statusCode ?? 200, result.headers ?? {});
    response.end(result.body ?? "");
  } catch (error) {
    sendJson(response, 500, {
      message: error instanceof Error ? error.message : "Unexpected local server error"
    });
  }
}

async function serveStatic(request, response) {
  const filePath = resolveStaticFile(request.url);
  const normalizedRoot = path.resolve(frontendRoot);
  const normalizedFile = path.resolve(filePath);

  if (!normalizedFile.startsWith(normalizedRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    await fs.access(normalizedFile);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(normalizedFile)] ?? "text/plain; charset=utf-8"
    });
    createReadStream(normalizedFile).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url || !request.method) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
    });
    response.end();
    return;
  }

  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;

  if (request.method === "POST" && pathname === "/events") {
    await runHandler(handlerModules.createEvent, request, response);
    return;
  }

  if (request.method === "GET" && pathname === "/events") {
    await runHandler(handlerModules.getEvents, request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/upload-url") {
    await runHandler(handlerModules.getUploadUrl, request, response);
    return;
  }

  if (request.method === "POST" && pathname === "/detect") {
    await runHandler(handlerModules.detectImage, request, response);
    return;
  }

  const eventByIdMatch = pathname.match(/^\/events\/([^/]+)$/);
  if (request.method === "GET" && eventByIdMatch) {
    await runHandler(handlerModules.getEventById, request, response, {
      id: decodeURIComponent(eventByIdMatch[1])
    });
    return;
  }

  const updateStatusMatch = pathname.match(/^\/events\/([^/]+)\/status$/);
  if (request.method === "PATCH" && updateStatusMatch) {
    await runHandler(handlerModules.updateEventStatus, request, response, {
      id: decodeURIComponent(updateStatusMatch[1])
    });
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`Local app available at http://${host}:${port}`);
  console.log("Storage mode: local");
  console.log("Detection provider: heuristic");
});
