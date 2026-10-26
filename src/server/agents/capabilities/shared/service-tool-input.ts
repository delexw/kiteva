import { z } from "zod";

/**
 * Publish the service-owned contract without transforming arguments in the MCP adapter.
 * Validation stays with the service, preserving its defaults and structured errors.
 */
export function serviceToolInput(schema: Record<string, unknown>) {
  return z.looseObject({}).meta(schema);
}
