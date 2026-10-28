import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "./store";
import type { Run } from "../../shared/contracts";
import { CodedError } from "../../shared/errors";

/** One read-only endpoint, shared by the backend and local development server. */
export function registerActivityChildrenRoute(
  app: FastifyInstance,
  store: Store,
  findRun: (id: string) => Run = (id) => {
    const run = store.get(id);
    if (!run) throw new CodedError("PROJECT_NOT_FOUND", "Run not found", 404);
    return run;
  },
) {
  app.get<{
    Params: { id: string };
    Querystring: { jobId?: string; path?: string; offset?: string };
  }>("/api/runs/:id/activity/children", async (req) => {
    const run = findRun(req.params.id);
    const query = z
      .object({
        jobId: z.string().max(200).default(""),
        path: z
          .string()
          .max(600)
          .regex(/^-?\d+(?:\.-?\d+)*$/)
          .optional(),
        offset: z.coerce.number().int().nonnegative().default(0),
      })
      .parse(req.query);
    const parents = query.path ? query.path.split(".").map(Number) : [];
    if (parents.length > 32)
      throw new CodedError("INVALID_REQUEST", "Activity hierarchy is too deep");
    return store.activityChildren(run, query.jobId, parents, query.offset);
  });
}
