import type { BrowserContext } from "puppeteer-core";
import { isLoopbackAddress, validateReferenceUrl } from "../../../requests/reference-url";

/** Temporary, origin-scoped access for a human identity-provider page to reach a device authenticator. */
export async function grantAuthenticationNetworkAccess(context: BrowserContext, value: string) {
  const { url } = await validateReferenceUrl(value, "local");
  await context.setPermission(
    url.origin,
    { permission: { name: "local-network" }, state: "granted" },
    { permission: { name: "loopback-network" }, state: "granted" },
  );
  return async () =>
    context.setPermission(
      url.origin,
      { permission: { name: "local-network" }, state: "denied" },
      { permission: { name: "loopback-network" }, state: "denied" },
    );
}

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
