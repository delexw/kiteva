import { TypeSafeClient } from "@typesafe-ai/sdk";

export const jevModel = "jev-1.14.0";

export function jevClient() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey)
    throw Error(
      "Set TYPESAFE_API_KEY in .env.local, then restart. JEV decisions are not configured.",
    );
  return new TypeSafeClient({ apiKey, timeout: 60000, retry: { maxRetries: 2 } });
}
