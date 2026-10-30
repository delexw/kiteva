import { z } from "zod";
import type { VideoRequest } from "../../shared/domains/video";
import { port } from "../runtime/config";

/** Submit through the same validation and workflow entry point as the application. */
export async function startIdeaThroughBackend(request: VideoRequest) {
  const response = await fetch(`http://127.0.0.1:${port}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = z.object({ error: z.string() }).safeParse(body);
    throw Error(
      error.success ? error.data.error : `Kiteva rejected the build (${response.status}).`,
    );
  }
  return z.object({ id: z.string(), phase: z.string() }).parse(await response.json());
}
