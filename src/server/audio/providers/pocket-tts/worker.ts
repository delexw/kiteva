import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { systemEnvironment } from "../../../runtime/platform";
import { terminateProcessTree } from "../../../runtime/process-tree";

const ReplySchema = z.discriminatedUnion("ok", [
  z.object({ id: z.string(), ok: z.literal(true) }),
  z.object({ id: z.string(), ok: z.literal(false), error: z.string() }),
]);
/** One provider-owned offline model process; the caller serializes requests. */
export class PocketTtsWorker {
  private child?: ChildProcessWithoutNullStreams;
  private pending?: { id: string; resolve: () => void; reject: (error: Error) => void };
  private stopping?: Promise<void>;
  private idle?: ReturnType<typeof setTimeout>;
  constructor(
    private executable: string,
    private args: string[],
    private cwd: string,
    private idleMs = 300000,
  ) {}

  stop(error = new Error("Pocket TTS worker stopped")) {
    clearTimeout(this.idle);
    const child = this.child;
    this.child = undefined;
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
    if (child) {
      this.stopping = terminateProcessTree(child.pid, { processGroup: true });
      void this.stopping.catch(() => {});
    }
    return this.stopping;
  }

  async synthesize(
    input: { textFile: string; output: string; voice: string },
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    if (this.stopping) await this.stopping;
    signal.throwIfAborted();
    if (this.pending) throw Error("Pocket TTS requests must be serialized");
    clearTimeout(this.idle);
    if (!this.child) {
      const child = spawn(this.executable, this.args, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
        env: systemEnvironment(),
      });
      this.child = child;
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + String(chunk)).slice(-6000);
      });
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        if (this.child !== child) return;
        const parsed = ReplySchema.safeParse(
          (() => {
            try {
              return JSON.parse(line);
            } catch {
              return undefined;
            }
          })(),
        );
        if (!parsed.success || parsed.data.id !== this.pending?.id) {
          this.stop(new Error("Invalid Pocket TTS worker response"));
          return;
        }
        const pending = this.pending!;
        this.pending = undefined;
        if (parsed.data.ok) pending.resolve();
        else {
          const error = new Error(parsed.data.error);
          this.stop(error);
          pending.reject(error);
        }
      });
      child.on("error", (error) => {
        if (this.child === child) this.stop(error);
      });
      child.on("close", (code) => {
        lines.close();
        if (this.child === child)
          this.stop(new Error(`Pocket TTS worker exited (${code}): ${stderr}`));
      });
    }
    const combined = AbortSignal.any([signal, AbortSignal.timeout(300000)]);
    const abort = () => this.stop(new Error("Pocket TTS request cancelled or timed out"));
    try {
      await new Promise<void>((resolve, reject) => {
        const id = randomUUID();
        this.pending = { id, resolve, reject };
        combined.addEventListener("abort", abort, { once: true });
        if (combined.aborted) {
          abort();
          return;
        }
        this.child!.stdin.write(JSON.stringify({ id, ...input }) + "\n", (error) => {
          if (error) this.stop(error);
        });
      });
    } finally {
      combined.removeEventListener("abort", abort);
      await this.stopping;
      signal.throwIfAborted();
      if (this.child) {
        this.idle = setTimeout(() => this.stop(), this.idleMs);
        this.idle.unref();
      }
    }
  }
}
