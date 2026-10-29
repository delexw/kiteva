import { credentialEnvironmentVariables } from "../runtime/credential-environment";
import { TypeSafeClient } from "@typesafe-ai/sdk";

export const jevModel = "jev-1.14.0";

export function jevClient() {
  const apiKey = process.env[credentialEnvironmentVariables.typesafeApiKey];
  if (!apiKey)
    throw Error(
      `Set ${credentialEnvironmentVariables.typesafeApiKey} in .env.local, then restart. JEV decisions are not configured.`,
    );
  return new TypeSafeClient({ apiKey, timeout: 60000, retry: { maxRetries: 2 } });
}
