import { z } from "zod";
import { createComponentRegistryTools } from "./component-registry-tools";

export function createAnimateUiTools(options: {
  workspace: string;
  readOnly: boolean;
  signal: AbortSignal;
  fetch?: typeof fetch;
}) {
  return createComponentRegistryTools({
    ...options,
    registry: {
      id: "animate-ui",
      displayName: "Animate UI",
      url: "https://animate-ui.com/r/",
      licenseUrl: "https://raw.githubusercontent.com/imskyleen/animate-ui/main/LICENSE.md",
      itemName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    },
  });
}
