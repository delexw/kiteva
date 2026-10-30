import { connect } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Run } from "../src/shared/contracts";
import { dataRoot, port as backendPort } from "../src/server/runtime/config";

export { backendPort };

export function savedRuns(): Run[] {
  const database = new DatabaseSync(path.join(dataRoot, "jobs.sqlite"), { readOnly: true });
  try {
    return database
      .prepare("SELECT json FROM runs")
      .all()
      .map((row) => JSON.parse(String((row as { json: string }).json)) as Run);
  } finally {
    database.close();
  }
}
export function backendListening() {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: backendPort });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
export async function inBatches<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency)
    results.push(...(await Promise.all(items.slice(index, index + concurrency).map(task))));
  return results;
}
