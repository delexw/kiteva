import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { CodedError } from "../../shared/errors";
import { agentMode } from "../runtime/config";
export function isLoopbackAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "loopback";
  } catch {
    return false;
  }
}
export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function validateReferenceUrl(value: string, mode: "local" | "hosted" = agentMode) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new CodedError(
      "PUBLIC_URL_REQUIRED",
      "Only HTTP(S) website URLs without credentials are supported",
    );
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  const localReference =
    addresses.length > 0 && addresses.every((a) => isLoopbackAddress(a.address));
  if (localReference && mode !== "local")
    throw new CodedError(
      "LOCAL_URL_REQUIRES_LOCAL_AGENT",
      "Localhost references require local agent mode",
    );
  if (!localReference && !["", "80", "443"].includes(url.port))
    throw new CodedError("PUBLIC_URL_REQUIRED", "Public HTTP(S) URLs must use standard ports");
  if (
    !addresses.length ||
    addresses.some(
      (a) => !isPublicAddress(a.address) && !(mode === "local" && isLoopbackAddress(a.address)),
    )
  )
    throw new CodedError("PUBLIC_URL_REQUIRED", "Private-network URL is not allowed");
  return { url, addresses };
}
