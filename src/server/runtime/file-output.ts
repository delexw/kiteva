import { createReadStream, unwatchFile, watchFile } from "node:fs";
import { stat } from "node:fs/promises";

/** Poll through Node's file watcher; drain in order and include the final bytes before closing. */
export function watchCommandOutput(file: string, output: (data: Buffer) => void) {
  let offset = 0;
  let failure: unknown;
  let reading = Promise.resolve();
  const drain = () => {
    reading = reading
      .then(async () => {
        if (failure) return;
        const size = (await stat(file)).size;
        if (size < offset) throw Error("Native command output was truncated");
        if (size === offset) return;
        for await (const chunk of createReadStream(file, { start: offset, end: size - 1 })) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          offset += bytes.length;
          output(bytes);
        }
      })
      .catch((error) => {
        failure = error;
      });
  };
  watchFile(file, { interval: 100, persistent: false }, drain);
  return async () => {
    unwatchFile(file, drain);
    drain();
    await reading;
    if (failure) throw failure;
  };
}
