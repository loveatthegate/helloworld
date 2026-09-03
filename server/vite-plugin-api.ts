import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { app } from "../netlify/functions/_shared/app";

function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const url = new URL(req.url || "/", origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method || "GET";
  if (method === "GET" || method === "HEAD") {
    return Promise.resolve(new Request(url, { method, headers }));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      resolve(
        new Request(url, {
          method,
          headers,
          body: body.length ? new Uint8Array(body) : undefined,
        }),
      );
    });
    req.on("error", reject);
  });
}

export function lvzhiApiPlugin(): Plugin {
  return {
    name: "lvzhi-api",
    configureServer(server) {
      process.env.LVZHI_VITE_API = "1";
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const origin = `http://${req.headers.host || "localhost"}`;
          const request = await toRequest(req as IncomingMessage, origin);
          const response = await app.fetch(request);
          await writeResponse(response, res as ServerResponse);
        } catch (error) {
          console.error(error);
          (res as ServerResponse).statusCode = 500;
          (res as ServerResponse).setHeader("Content-Type", "application/json");
          (res as ServerResponse).end(
            JSON.stringify({ error: error instanceof Error ? error.message : "服务器错误" }),
          );
        }
      });
    },
  };
}

async function writeResponse(response: Response, res: ServerResponse) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}
