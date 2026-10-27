export interface ReferenceAuthenticationRequest {
  id: string;
  origin: string;
  message: string;
}
export type ReferenceAuthenticationAction = "focus" | "continue";
