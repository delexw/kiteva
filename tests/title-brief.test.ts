import { expect, it, vi } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { textModels } from "../src/server/agents/models";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import {
  runTitleBriefWorkflow,
  TitleBriefSchema,
  TitleBriefCheckpointSchema,
  titleBriefPrompt,
} from "../src/server/jobs/subworkflows/title-brief/workflow";
import { preparationBriefPrompt } from "../src/server/jobs/subworkflows/full-brief/preparation";
import { briefTitleGuidance } from "../src/server/jobs/subworkflows/shared/brief-title-guidance";

it("shares title direction with the full brief, with only a subject in the title schema", () => {
  expect(titleBriefPrompt).toContain(briefTitleGuidance);
  expect(preparationBriefPrompt).toContain(briefTitleGuidance);
  expect(Object.keys(TitleBriefSchema.shape)).toEqual(["subject"]);
  expect(TitleBriefSchema.safeParse({ subject: "  " }).success).toBe(false);
  expect(
    TitleBriefCheckpointSchema.safeParse({ value: { subject: "Old full brief" } }).success,
  ).toBe(false);
});
it.each(["claude", "codex"] as const)(
  "extracts only a title using %s without tools or request mutation",
  async (provider) => {
    vi.mocked(agentTurn).mockResolvedValue({ value: { subject: " A clear product story " } });
    const request = RequestSchema.parse({
      provider,
      instructions: 'An original idea\nCredits: Avery. Exact closing: "Make ideas move."',
      urls: ["https://example.com"],
      selectedStyleIds: ["style-018"],
      candidateCount: 0,
    });
    const original = structuredClone(request);
    const result = await runTitleBriefWorkflow({
      request,
      workspace: "/tmp/title-brief-test",
      signal: new AbortController().signal,
      onEvent: () => {},
    });
    expect(result).toEqual({ variant: "title-only", value: { subject: "A clear product story" } });
    const options = vi.mocked(agentTurn).mock.lastCall![0];
    expect(options).toMatchObject({
      provider,
      model: textModels[provider],
      readOnly: true,
      textOnly: true,
    });
    expect(options.prompt).toContain(JSON.stringify(request.instructions));
    expect(options.promptContext).toBeUndefined();
    expect(options.referenceUrls).toBeUndefined();
    expect(options.exploreBriefSections).toBeUndefined();
    expect(request).toEqual(original);
  },
);
it("propagates failure instead of silently replacing the requested title workflow", async () => {
  vi.mocked(agentTurn).mockRejectedValueOnce(Error("Provider unavailable"));
  await expect(
    runTitleBriefWorkflow({
      request: RequestSchema.parse({ instructions: "An original idea" }),
      workspace: "/tmp/title-brief-test",
      signal: new AbortController().signal,
      onEvent: () => {},
    }),
  ).rejects.toThrow("Provider unavailable");
});
