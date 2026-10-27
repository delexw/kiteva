import { z } from "zod";

export async function waitForProjectAuthentication(
  origin: string,
  signal: AbortSignal,
  focus: () => Promise<void>,
  validate: () => Promise<void>,
) {
  const url = process.env.KITEVA_AUTH_BRIDGE_URL;
  const token = process.env.KITEVA_AUTH_BRIDGE_TOKEN;
  if (!url || !token) return false;
  async function post(route: string, body: object) {
    const response = await fetch(`${url}${route}`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error("Kiteva sign-in handoff disconnected");
    return response.json();
  }
  const { id } = z.object({ id: z.string().uuid() }).parse(await post("/request", { origin }));
  try {
    while (true) {
      signal.throwIfAborted();
      const { action } = z
        .object({ action: z.enum(["focus", "continue"]) })
        .parse(await post("/action", { id }));
      if (action === "focus") {
        await focus();
        continue;
      }
      try {
        await validate();
        return true;
      } catch {
        await post("/status", {
          id,
          message: "Sign-in is not complete. Finish signing in in the browser, then continue.",
        });
      }
    }
  } finally {
    await post("/status", { id, complete: true }).catch(() => {});
  }
}
