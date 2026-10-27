import {
  normalizeSubtitleFields,
  subtitleCompatibilityPayload,
} from "../../shared/subtitle-compatibility";
import { CodedError, parseErrorCode } from "../../shared/errors";
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (
    options?.body != null &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const requestBody =
    typeof options?.body === "string" && headers.get("Content-Type")?.includes("application/json")
      ? JSON.stringify(subtitleCompatibilityPayload(JSON.parse(options.body)))
      : options?.body;
  const response = await fetch(url, { ...options, body: requestBody, headers });
  const body = normalizeSubtitleFields(await response.json());
  if (!response.ok)
    throw new CodedError(
      parseErrorCode(body.code),
      body.error || "Request failed",
      response.status,
    );
  return body;
}
