import { z } from "zod";
import { createComponentRegistryTools } from "./component-registry-tools";

export function createReactBitsTools(options: {
  workspace: string;
  readOnly: boolean;
  signal: AbortSignal;
  fetch?: typeof fetch;
}) {
  return createComponentRegistryTools({
    ...options,
    registry: {
      id: "react-bits",
      displayName: "React Bits",
      url: "https://reactbits.dev/r/",
      licenseUrl: "https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md",
      itemName: z.string().regex(/^[A-Za-z0-9]+-(JS|TS)-(CSS|TW)$/),
    },
  });
}
