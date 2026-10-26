import type { BrowserContext } from "puppeteer-core";
import { isLoopbackAddress, validateReferenceUrl } from "../../../requests/reference-url";

/** Decide network permissions before navigation so Chrome cannot prompt during a take. */
export async function configureReferencePermissions(
  context: BrowserContext,
  origins: readonly string[],
  mode: "local" | "hosted",
) {
  await context.setPermission(
    "*",
    { permission: { name: "local-network" }, state: "denied" },
    { permission: { name: "loopback-network" }, state: "denied" },
  );
  for (const origin of new Set(origins.map((value) => new URL(value).origin))) {
    const validated = await validateReferenceUrl(origin, mode);
    if (mode === "local" && validated.addresses.every(({ address }) => isLoopbackAddress(address)))
      await context.setPermission(origin, {
        permission: { name: "loopback-network" },
        state: "granted",
      });
  }
}
