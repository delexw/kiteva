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
  useEffect(() => {
    const controller = new AbortController();
    void api<ReferenceAuthenticationRequest[]>(`/api/runs/${runId}/authentication`, {
      signal: controller.signal,
    })
      .then(setRequests)
      .catch(() => {});
    return () => controller.abort();
  }, [runId, revision]);
  async function act(id: string, action: ReferenceAuthenticationAction) {
    try {
      setError("");
      await api(`/api/runs/${runId}/authentication/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
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
              {error && <span role="alert">{error}</span>}
            </Space>
          }
        />
      ))}
    </>
  );
}
