import type { RendererMetadata } from "../src/server/rendering/metadata";
import { expect, it } from "vitest";
import { rendererMetadataFor } from "../src/server/rendering/renderer-metadata";
import {
  rendererCommandFlags,
  rendererCliPath,
  rendererUsesStage,
  rendererCommandLabel,
  rendererStageLabels,
  rendererReproductionCommand,
} from "../src/server/rendering/execution";
import { renderContract } from "../src/server/rendering/contracts";
import {
  multiplaneInspectArgs,
  multiplaneVerifyArgs,
  multiplaneRenderArgs,
} from "../src/server/rendering/multiplane";
import { multiplaneMetadata } from "../src/server/rendering/multiplane/metadata";

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

it("one Multiplane policy change reaches CLI commands, both prompts and reproduction instructions", () => {
  const flag = "--example-policy-flag";
  multiplaneMetadata.execution.commonFlags.push(flag);
  try {
    expect(multiplaneInspectArgs("shot.html")).toContain(flag);
    expect(multiplaneVerifyArgs("shot.html", 30)).toContain(flag);
    for (const kind of ["preview", "full"] as const) {
      expect(
        multiplaneRenderArgs({ shot: "shot.html", output: "renders/output", fps: 30, kind }),
      ).toContain(flag);
      expect(
        renderContract("multiplane", { width: 1280, height: 720, duration: 3, fps: 30, kind }),
      ).toContain(flag);
      expect(rendererReproductionCommand(multiplaneMetadata, "shot.html", 30, kind)).toContain(
        flag,
      );
    }
  } finally {
    multiplaneMetadata.execution.commonFlags.pop();
  }
});

it("keeps preview/full stage lists and render settings in each renderer definition", () => {
  expect(rendererStageLabels(multiplaneMetadata, "preview")).toBe(
    rendererCommandLabel(multiplaneMetadata, "render"),
  );
  expect(rendererStageLabels(multiplaneMetadata, "full")).toContain(
    rendererCommandLabel(multiplaneMetadata, "verify"),
  );
  for (const kind of ["preview", "full"] as const) {
    const args = multiplaneRenderArgs({
      shot: "shot.html",
      output: "renders/output",
      fps: 30,
      kind,
    });
    expect(args[args.indexOf("--format") + 1]).toBe(multiplaneMetadata.execution.format[kind]);
    expect(args[args.indexOf("--quality") + 1]).toBe(multiplaneMetadata.execution.quality[kind]);
  }
});

it.each(["hyperframes", "multiplane", "remotion"] as const)(
  "%s reproduction uses its native output syntax",
  (renderer) => {
    const metadata: RendererMetadata = rendererMetadataFor(renderer);
    const result = rendererReproductionCommand(metadata, "example-source", 30, "full");
    expect(result).toContain(`node_modules/.bin/${renderer} render example-source`);
    expect(result).toContain("--fps 30");
    if (metadata.execution.outputArgument)
      expect(result).toContain(`${metadata.execution.outputArgument} renders/output.mp4`);
    else expect(result).toContain(`${metadata.execution.compositionId}`);
  },
);
