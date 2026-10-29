import { useEffect, useState } from "react";
import { api } from "./lib/api";

/** Validate saved viewer data without accepting it as build output or writing it back. */
export function useArtifactJson<T>(
  url: string | undefined,
  schema: { parse: (value: unknown) => T },
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError(false);
    if (url)
      void api<unknown>(url, { signal: controller.signal })
        .then((value) => {
          const parsed = schema.parse(value);
          if (!controller.signal.aborted) setData(parsed);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        });
    return () => controller.abort();
  }, [url, schema]);
  return { data, error };
}
