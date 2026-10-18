import { fileURLToPath } from "node:url";

/** Shared resolution without initializing development-server plugins in test workers. */
export const browserAliases = { "@": fileURLToPath(new URL("./src/client", import.meta.url)) };
