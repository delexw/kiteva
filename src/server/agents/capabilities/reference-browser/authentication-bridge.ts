import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type {
  ReferenceAuthenticationAction,
  ReferenceAuthenticationRequest,
} from "../../../../shared/reference-authentication";

interface PendingAuthentication extends ReferenceAuthenticationRequest {
  workspace: string;
  send: (action: ReferenceAuthenticationAction) => void;
}
const pending = new Map<string, PendingAuthentication>();
const inside = (root: string, workspace: string) => {
  const relative = path.relative(path.resolve(root), path.resolve(workspace));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};
export function pendingReferenceAuthentications(root: string): ReferenceAuthenticationRequest[] {
  return [...pending.values()]
    .filter((item) => inside(root, item.workspace))
    .map(({ id, origin, message }) => ({ id, origin, message }));
}
export function answerReferenceAuthentication(
  root: string,
  id: string,
  action: ReferenceAuthenticationAction,
) {
  const request = pending.get(id);
  if (!request || !inside(root, request.workspace)) return false;
  request.send(action);
  return true;
}

/** Per-invocation, token-protected IPC. The caller owns activity tracking. */
export async function startAuthenticationBridge(
  workspace: string,
  signal: AbortSignal,
  changed: () => void,
) {
  signal.throwIfAborted();
  const token = randomUUID();
  const owned = new Set<string>();
  const actions = new Map<string, ReferenceAuthenticationAction[]>();
  const readers = new Map<string, (action: ReferenceAuthenticationAction) => void>();
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403).end();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4096) throw Error("Request too large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (req.url === "/request" && req.method === "POST") {
        const { origin } = z.object({ origin: z.string().url() }).parse(body);
        const id = randomUUID();
        owned.add(id);
        actions.set(id, []);
        pending.set(id, {
          id,
          origin: new URL(origin).origin,
          workspace,
          message: "Sign in in the browser, then continue here. This step is paused.",
          send(action) {
            const reader = readers.get(id);
            if (reader) {
              readers.delete(id);
              reader(action);
            } else {
              const queue = actions.get(id)!;
              if (!queue.includes(action)) queue.push(action);
            }
          },
        });
        changed();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id }));
        return;
      }
      const { id } = z.object({ id: z.string().uuid() }).parse(body);
      if (!owned.has(id)) {
        res.writeHead(404).end();
        return;
      }
      if (req.url === "/action") {
        const queued = actions.get(id)!.shift();
        res.setHeader("Content-Type", "application/json");
        // Send headers immediately and JSON whitespace while waiting. Native fetch otherwise
        // times out after five minutes without headers/body activity during human sign-in.
        res.flushHeaders();
        const heartbeat = setInterval(() => res.write("\n"), 15000);
        heartbeat.unref();
        res.once("close", () => clearInterval(heartbeat));
        const send = (action: ReferenceAuthenticationAction) => {
          clearInterval(heartbeat);
          res.end(JSON.stringify({ action }));
        };
        if (queued) send(queued);
        else {
          readers.set(id, send);
          res.once("close", () => {
            if (readers.get(id) === send) readers.delete(id);
          });
        }
        return;
      }
      if (req.url === "/status") {
        const { message, complete } = z
          .object({ message: z.string().max(500).optional(), complete: z.boolean().optional() })
          .parse(body);
        if (complete) {
          pending.delete(id);
          owned.delete(id);
          actions.delete(id);
        } else if (message) pending.get(id)!.message = message;
        changed();
        res.end("{}");
        return;
      }
      res.writeHead(404).end();
    } catch {
      res.writeHead(400).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Authentication bridge unavailable");
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", abort);
    const hadRequests = owned.size > 0;
    for (const id of owned) pending.delete(id);
    owned.clear();
    readers.clear();
    actions.clear();
    if (hadRequests) changed();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const abort = () => {
    void close();
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) await close();
  return { url: `http://127.0.0.1:${address.port}`, token, close };
}
