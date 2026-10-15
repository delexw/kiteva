import { CodedError } from "../../shared/errors";
import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import type { Asset } from "../../shared/contracts.js";
import { agentMode } from "../runtime/config";
export { isLoopbackAddress, isPublicAddress } from "./reference-url";
import { validateReferenceUrl } from "./reference-url";
export async function readReferenceUrl(
  value: string,
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
  redirects = 0,
): Promise<string> {
  const { url, addresses } = await validateReferenceUrl(value, mode);
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? https.get : http.get;
    const req = get(
      url,
      {
        signal,
        timeout: 15000,
        headers: { accept: "text/html,text/plain,application/json", "accept-encoding": "identity" },
        lookup: ((_host, _opts, cb) => cb(null, addresses)) as http.RequestOptions["lookup"],
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3) return reject(Error("Too many URL redirects"));
          void readReferenceUrl(
            new URL(res.headers.location!, url).href,
            signal,
            mode,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error(`URL returned HTTP ${res.statusCode}`));
          return;
        }
        const mime = res.headers["content-type"] || "";
        if (!/text\/|application\/json/.test(mime)) {
          res.resume();
          reject(
            Error(
              "Public URL must be a readable HTML, text, or JSON page; upload other files instead",
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) {
            req.destroy(Error("URL response exceeds 2 MB"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve(
            Buffer.concat(chunks)
              .toString("utf8")
              .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .slice(0, 24000),
          ),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Error("URL timed out")));
  });
}
export async function describeAsset(asset: Asset) {
  if (asset.bytes > 25_000_000) throw new CodedError("FILE_TOO_LARGE", "Asset exceeds size limit");
  const buffer = await readFile(asset.path);
  const text = await extractAssetText(asset, buffer);
  if (text !== undefined) return `${asset.name}: ${text.slice(0, 24000)}`;
  if (asset.kind.startsWith("image/")) {
    const m = await sharp(buffer).metadata();
    return `${asset.name}: supplied image, ${m.width}×${m.height}, ${m.format}. Inspect the local image before describing its content.`;
  }
  return `${asset.name}: supplied ${asset.kind}, ${asset.bytes} bytes. Inspect with local tools if its contents affect the brief.`;
}

export async function extractAssetText(asset: Asset, buffer?: Buffer) {
  buffer ??= await readFile(asset.path);
  if (/\.(txt|md|json|csv)$/i.test(asset.name)) return buffer.toString("utf8");
  if (/\.pdf$/i.test(asset.name)) {
    const pdf = new PDFParse({ data: buffer });
    try {
      return (await pdf.getText()).text;
    } finally {
      await pdf.destroy();
    }
  }
  if (/\.docx$/i.test(asset.name)) return (await mammoth.extractRawText({ buffer })).value;
  return undefined;
}
