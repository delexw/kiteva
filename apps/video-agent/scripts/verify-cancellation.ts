import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { z } from "zod";
import { agentTurn } from "../src/server/agents/providers";
import type { Provider } from "../src/shared/contracts";
for (const provider of ["codex", "claude"] as Provider[]) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "video-cancel-"));
  const controller = new AbortController();
  let sessionOpened = false;
  let rejected = false;
  const started = Date.now();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    await agentTurn({
      provider,
      workspace,
      readOnly: true,
      signal: controller.signal,
      schema: z.object({ ready: z.boolean() }),
      prompt:
        "Prepare a detailed plan for a procedural animation. Do not call tools or read files. Return ready true when the plan is complete.",
      onEvent: (event) => {
        if (event.type === "session") {
          sessionOpened = true;
          controller.abort();
        }
      },
    });
  } catch {
    rejected = true;
  } finally {
    clearTimeout(timeout);
    await rm(workspace, { recursive: true, force: true });
  }
  assert.equal(sessionOpened, true, `${provider}: native session must open before cancellation`);
  assert.equal(rejected, true, `${provider}: active cancelled turn must reject`);
  console.log(
    JSON.stringify({ provider, sessionOpened, cancelled: true, elapsedMs: Date.now() - started }),
  );
}
