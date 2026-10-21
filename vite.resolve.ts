import { fileURLToPath } from "node:url";

/** Shared resolution without initializing development-server plugins in test workers. */
export const browserAliases = { "@": fileURLToPath(new URL("./src/client", import.meta.url)) };

/** Scan the real client entry once, avoiding preview HTML and late optimizer reloads in browser fixtures. */
export const browserDependencyScan = { entries: ["index.html"] };
