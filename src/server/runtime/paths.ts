import path from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const dataRoot = path.join(appRoot, ".data");
