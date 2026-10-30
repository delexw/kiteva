import { z } from "zod";

export const DEFAULT_BACKEND_PORT = 18417;
export const DEFAULT_WEB_PORT = 18419;

const PortSchema = z.coerce.number().int().min(1024).max(65535);

/** Dedicated overrides only; invalid or colliding settings fail instead of picking another port. */
export function resolveLocalPorts(env: Record<string, string | undefined> = {}) {
  const backend = PortSchema.parse(env.VIDEO_AGENT_PORT || DEFAULT_BACKEND_PORT);
  const web = PortSchema.parse(env.VIDEO_AGENT_WEB_PORT || DEFAULT_WEB_PORT);
  if (backend === web) throw Error("VIDEO_AGENT_PORT and VIDEO_AGENT_WEB_PORT must differ");
  return { backend, web };
}
