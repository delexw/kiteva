import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { errorCode } from "../../shared/errors";
import { safeMessage } from "./config.js";

/** One error response shape for every API route, including the room routes served by Vite. */
export function apiErrorHandler(err: unknown, _req: FastifyRequest, reply: FastifyReply) {
  const status = (err as { statusCode?: number }).statusCode;
  return reply.code(err instanceof z.ZodError ? 400 : status && status < 500 ? status : 400).send({
    code:
      err instanceof z.ZodError
        ? "INVALID_REQUEST"
        : err instanceof Error && "code" in err && err.code === "FST_REQ_FILE_TOO_LARGE"
          ? "FILE_TOO_LARGE"
          : errorCode(err),
    error: safeMessage(err),
  });
}
