import { Alert, Button, Space } from "antd";
import { useEffect, useState } from "react";
import type {
  ReferenceAuthenticationAction,
  ReferenceAuthenticationRequest,
} from "../../shared/reference-authentication";
import { api } from "../lib/api";

export function ReferenceSignIn({ runId, revision }: { runId: string; revision: number }) {
  const [requests, setRequests] = useState<ReferenceAuthenticationRequest[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let controller: AbortController | undefined;
    const reload = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void api<ReferenceAuthenticationRequest[]>(`/api/runs/${runId}/authentication`, {
        signal: request.signal,
      })
        .then((next) => {
          if (!request.signal.aborted) {
            setRequests(next);
            setError("");
          }
        })
        .catch((failure) => {
          if (!request.signal.aborted)
            setError(failure instanceof Error ? failure.message : "Unable to check sign-in status");
        });
    };
    const visible = () => {
      if (document.visibilityState === "visible") reload();
    };
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", reload);
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [runId, revision, refresh]);
  async function act(id: string, action: ReferenceAuthenticationAction) {
    try {
      setError("");
      await api(`/api/runs/${runId}/authentication/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to continue sign-in");
    }
  }
  return (
    <>
      {requests.map((request) => (
        <Alert
          key={request.id}
          type="warning"
          showIcon
          title={`Waiting for you to sign in — ${request.origin}`}
          description={
            <Space orientation="vertical">
              <span>{request.message}</span>
              <Space wrap>
                <Button onClick={() => void act(request.id, "focus")}>Sign in</Button>
                <Button type="primary" onClick={() => void act(request.id, "continue")}>
                  Continue after signing in
                </Button>
              </Space>
            </Space>
          }
        />
      ))}
      {error && <Alert type="error" showIcon title={error} />}
    </>
  );
}
