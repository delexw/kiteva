import { expect, it } from "vitest";
import type { RendererMetadata } from "../src/server/rendering/metadata";
import { rendererMetadataFor } from "../src/server/rendering/renderer-metadata";
import {
  rendererCommandFlags,
  rendererCliPath,
  rendererUsesStage,
} from "../src/server/rendering/execution";

it.each(["hyperframes", "multiplane", "remotion"] as const)(
  "%s commands and stages use its owned execution policy",
  (renderer) => {
    const metadata: RendererMetadata = rendererMetadataFor(renderer);
    expect(rendererCliPath(metadata)).toContain(metadata.execution.cliPath);
    for (const kind of ["preview", "full"] as const) {
      for (const command of ["check", "inspect", "verify", "render"] as const) {
        expect(rendererUsesStage(metadata, kind, command)).toBe(
          metadata.execution.stages[kind].includes(command),
        );
        expect(rendererCommandFlags(metadata, command)).toEqual([
          ...(metadata.execution.commandFlags[command] ?? []),
          ...metadata.execution.commonFlags,
        ]);
      }
    }
  },
);
