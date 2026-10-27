/** A failed human handoff invalidates the browser session, not the supplied website. */
export class ReferenceAuthenticationError extends Error {
  constructor(cause: unknown) {
    super(
      `Website sign-in handoff failed: ${cause instanceof Error ? cause.message : "connection lost"}. Retry inspection to start a fresh sign-in session.`,
      { cause },
    );
    this.name = "ReferenceAuthenticationError";
  }
}
