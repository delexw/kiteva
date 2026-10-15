import type { Provider } from "../../shared/contracts";

export class ModelCapacityError extends Error {
  constructor(
    message: string,
    readonly provider: Provider,
  ) {
    super(message);
    this.name = "ModelCapacityError";
  }
}
