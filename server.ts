import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { serveDir } from "@std/http/file-server";
import type { Connect, ViteDevServer } from "vite";

// Constants
const isProduction = Deno.env.get("NODE_ENV") === "production";
const port = Number(Deno.env.get("PORT") ?? 5173);
const base = Deno.env.get("BASE") ?? "/";

// Cached production assets
const templateHtml = isProduction
  ? await Deno.readTextFile("./dist/client/index.html")
  : "";

type Render = (url: string) => Promise<{ html?: string; head?: string }>;
type WebMiddleware = (
  req: Request,
  info: Deno.ServeHandlerInfo,
) => Promise<Response | null>;

// Add Vite or respective production middlewares
let vite: ViteDevServer | undefined;
let viteHandler: WebMiddleware | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    base,
  });
  viteHandler = connectToWeb(vite.middlewares);
}

// Start http server (Deno primitive instead of express)
Deno.serve(
  {
    port,
    onListen: ({ port }) =>
      console.log(`Server started at http://localhost:${port}`),
  },
  async (req, info) => {
    // Let Vite (dev) handle assets, modules and HMR client requests first.
    if (viteHandler) {
      const handled = await viteHandler(req, info);
      if (handled) return maybeGzip(handled, req);
    }

    // Serve built client assets in production.
    if (isProduction) {
      // showIndex:false so "/" (and other routes) fall through to SSR instead
      // of being short-circuited by the static dist/client/index.html template.
      const fileRes = await serveDir(req, {
        fsRoot: "./dist/client",
        quiet: true,
        showIndex: false,
      });
      if (fileRes.status !== 404) return maybeGzip(fileRes, req);
    }

    // Serve HTML (SSR catch-all)
    try {
      const url = new URL(req.url).pathname.replace(base, "");

      let template: string;
      let render: Render;
      if (!isProduction) {
        // Always read fresh template in development
        template = await Deno.readTextFile("./index.html");
        template = await vite!.transformIndexHtml(url, template);
        render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render;
      } else {
        template = templateHtml;
        // Vite emits the SSR entry as .mjs (no package.json "type":"module").
        render = (await import("./dist/server/entry-server.mjs")).render;
      }

      const rendered = await render(url);

      const html = template
        .replace(`<!--app-head-->`, rendered.head ?? "")
        .replace(`<!--app-html-->`, rendered.html ?? "");

      return maybeGzip(
        new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
        req,
      );
    } catch (e) {
      const err = e as Error;
      vite?.ssrFixStacktrace(err);
      console.log(err.stack);
      return new Response(err.stack, { status: 500 });
    }
  },
);

/**
 * Gzip a response body with the web-standard CompressionStream when the client
 * accepts it and the payload is compressible. Replaces express `compression`.
 */
function maybeGzip(response: Response, request: Request): Response {
  if (!response.body || response.headers.has("content-encoding"))
    return response;
  if (!(request.headers.get("accept-encoding") ?? "").includes("gzip"))
    return response;

  const type = response.headers.get("content-type") ?? "";
  if (
    !/^(text\/|application\/(javascript|json|wasm|xml)|image\/svg)/.test(type)
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-encoding", "gzip");
  headers.append("vary", "Accept-Encoding");

  return new Response(
    response.body.pipeThrough(new CompressionStream("gzip")),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

/**
 * Adapt a connect-style middleware stack (e.g. `vite.middlewares`) to a
 * Deno.serve handler. Resolves to a `Response` when the stack handled the
 * request, or `null` when it called `next()` so the caller can fall through.
 */
function connectToWeb(middlewares: Connect.Server): WebMiddleware {
  return (request, info) =>
    new Promise<Response | null>((resolve, reject) => {
      const url = new URL(request.url);
      const encoder = new TextEncoder();
      const chunks: Uint8Array[] = [];

      // Minimal Node IncomingMessage built from the web Request.
      const req = (request.body
        ? Readable.fromWeb(request.body as never)
        : Readable.from([])) as never as Record<string, unknown>;
      req.url = url.pathname + url.search;
      req.method = request.method;
      req.headers = Object.fromEntries(request.headers);
      const socket = {
        remoteAddress: (info.remoteAddr as Deno.NetAddr)?.hostname,
        encrypted: false,
      };
      req.socket = socket;
      req.connection = socket;
      req.httpVersion = "1.1";

      // Minimal Node ServerResponse that resolves a web Response.
      const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
      const headers = new Headers();
      res.statusCode = 200;
      res.statusMessage = "";
      res.headersSent = false;
      res.writable = true;
      res.socket = socket;

      const toBytes = (c: unknown): Uint8Array =>
        typeof c === "string"
          ? encoder.encode(c)
          : c instanceof Uint8Array
            ? c
            : new Uint8Array(c as ArrayBuffer);

      res.setHeader = (
        name: string,
        value: number | string | readonly string[],
      ) => {
        if (Array.isArray(value)) {
          headers.delete(name);
          for (const v of value) headers.append(name, String(v));
        } else {
          headers.set(name, String(value));
        }
        return res;
      };
      res.getHeader = (name: string) => headers.get(name) ?? undefined;
      res.getHeaders = () => Object.fromEntries(headers);
      res.getHeaderNames = () => [...headers.keys()];
      res.hasHeader = (name: string) => headers.has(name);
      res.removeHeader = (name: string) => headers.delete(name);
      res.appendHeader = (name: string, value: string | readonly string[]) => {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(name, String(v));
        } else {
          headers.append(name, String(value as string));
        }
        return res;
      };
      res.setHeaders = (entries: Headers | Map<string, string>) => {
        for (const [k, v] of entries) headers.set(k, String(v));
        return res;
      };
      res.flushHeaders = () => {
        res.headersSent = true;
      };
      res.writeHead = (status: number, arg2?: unknown, arg3?: unknown) => {
        res.statusCode = status;
        let extra = arg3 as Record<string, unknown> | undefined;
        if (typeof arg2 === "string") res.statusMessage = arg2;
        else extra = arg2 as Record<string, unknown> | undefined;
        if (extra)
          for (const [k, v] of Object.entries(extra))
            (res.setHeader as CallableFunction)(k, v);
        res.headersSent = true;
        return res;
      };
      res.write = (chunk: unknown, _enc?: unknown, cb?: unknown) => {
        if (chunk) chunks.push(toBytes(chunk));
        const done = typeof _enc === "function" ? _enc : cb;
        if (typeof done === "function") done();
        return true;
      };
      res.end = (chunk?: unknown, _enc?: unknown, cb?: unknown) => {
        if (typeof chunk === "function") {
          cb = chunk;
          chunk = undefined;
        } else if (typeof _enc === "function") {
          cb = _enc;
        }
        if (chunk) chunks.push(toBytes(chunk));
        res.headersSent = true;
        const body = chunks.length ? new Blob(chunks as BlobPart[]) : null;
        resolve(
          new Response(body, {
            status: res.statusCode as number,
            statusText: (res.statusMessage as string) || undefined,
            headers,
          }),
        );
        res.emit("finish");
        res.emit("close");
        if (typeof cb === "function") cb();
        return res;
      };

      // connect invokes next() when nothing handled the request.
      const next = (err?: unknown) => (err ? reject(err) : resolve(null));

      try {
        middlewares(req as never, res as never, next);
      } catch (err) {
        reject(err);
      }
    });
}
