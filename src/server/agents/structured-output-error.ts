import { z } from "zod";

/** Preserve the response and owning session when application validation rejects SDK output. */
export class StructuredOutputError extends z.ZodError {
  constructor(
    error: z.ZodError,
    readonly output: unknown,
    readonly sessionId?: string,
  ) {
    super(error.issues);
  }
}
