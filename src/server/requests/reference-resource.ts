import http from "node:http";
import https from "node:https";
import { validateReferenceUrl } from "./reference-url";

export const referenceResourceLimits = {
  resourceBytes: 32_000_000,
  sessionBytes: 80_000_000,
  requests: 500,
} as const;

// Chromium receives responses through Node so DNS stays pinned to validated addresses.
// Its proxy has no upstream: traffic that bypasses interception cannot reach a website.
export async function referenceResource(
  value: string,
  signal: AbortSignal,
  mode: "local" | "hosted",
  headers: Record<string, string> = {},
  consumeBytes: (bytes: number) => void = () => {},
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const { url, addresses } = await validateReferenceUrl(value, mode);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? https.get : http.get;
    const request = get(
      url,
      {
        signal,
        timeout: 10000,
        headers: {
          ...Object.fromEntries(
            Object.entries(headers).filter(
              ([name]) =>
                ![
                  "host",
                  "connection",
                  "content-length",
                  "transfer-encoding",
                  "accept-encoding",
                  "authorization",
                  "proxy-authorization",
                ].includes(name.toLowerCase()),
            ),
          ),
          accept: headers.accept || "*/*",
          "accept-encoding": "identity",
          ...(headers["user-agent"] ? { "user-agent": headers["user-agent"] } : {}),
          ...(headers.cookie ? { cookie: headers.cookie } : {}),
        },
        lookup: ((_host, _options, callback) =>
          callback(null, addresses)) as http.RequestOptions["lookup"],
      },
      (response) => {
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          try {
            signal.throwIfAborted();
            consumeBytes(chunk.length);
            size += chunk.length;
            if (size > referenceResourceLimits.resourceBytes)
              throw Error(
                `Reference resource exceeds ${referenceResourceLimits.resourceBytes / 1_000_000} MB`,
              );
            chunks.push(chunk);
          } catch (error) {
            request.destroy(error instanceof Error ? error : Error(String(error)));
          }
        });
        response.on("error", reject);
        response.on("end", () => {
          const responseHeaders: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (
              value !== undefined &&
              !["transfer-encoding", "connection", "content-length"].includes(name)
            )
              responseHeaders[name] = Array.isArray(value) ? value.join("\n") : value;
          }
          resolve({
            status: response.statusCode || 502,
            headers: responseHeaders,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    request.on("error", reject);
    request.on("timeout", () => request.destroy(Error("Reference resource timed out")));
  });
}
