import { afterEach, expect, it, vi } from "vitest";
import { BriefRequirementsSchema } from "../src/shared/brief-sections";
import { RequestSchema } from "../src/shared/contracts";
import { selectAudioAuthoring } from "../src/server/jev/strategies/audio-authoring";
import { audioStudioAvailability } from "../src/server/agents/capabilities/audio-studio/client";
vi.mock("../src/server/agents/capabilities/audio-studio/client", () => ({
  audioStudioAvailability: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function input() {
  const request = RequestSchema.parse({
    instructions: "Explain an idea with a musical hook",
    renderer: "multiplane",
    requirements: BriefRequirementsSchema.parse({
      main: {},
      images: {},
      urls: {},
      music: { instructions: "  Original music wording.\nKeep this exact line.  " },
    }),
  });
  if (request.outputType === "page") throw Error("Expected video");
  return {
    request,
    workspace: "/tmp/audio-choice-test",
    preview: false,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
}
it.each(["preview", "uploads", "empty"])("bypasses generation selection for %s", async (kind) => {
  const options = input();
  if (kind === "preview") options.preview = true;
  if (kind === "uploads")
    options.request.requirements!.music.assetIds = ["11111111-1111-4111-8111-111111111111"];
  if (kind === "empty") options.request.requirements!.music.instructions = "  ";
  expect((await selectAudioAuthoring(options)).source).toBe(
    kind === "uploads" ? "uploads" : "skipped",
  );
  expect(audioStudioAvailability).not.toHaveBeenCalled();
});
it.each([
  ["hyperframes", true],
  ["hyperframes", false],
  ["multiplane", true],
  ["multiplane", false],
] as const)(
  "uses %s metadata and available capabilities (Audio Studio ready=%s) for Choice",
  async (renderer, available) => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");
    vi.mocked(audioStudioAvailability).mockResolvedValue({
      available,
      limitation: available ? undefined : "Not installed",
      tools: available
        ? [
            {
              name: "generate_audio",
              description: "Native instrumental generation",
              inputSchema: {
                type: "object",
                properties: { duration_seconds: { type: "number", minimum: 0.5, maximum: 380 } },
              },
            },
          ]
        : undefined,
      instructions: available ? "Native audio operation guidance" : undefined,
      modelReadiness: "not_probed",
    });
    const options = input();
    options.request.renderer = renderer;
    const original = structuredClone(options.request);
    const winner = available ? "audio_studio" : "local_audio";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init.body));
        expect(body.state.musicPrompt).toBe(options.request.requirements!.music.instructions);
        expect(body.questions.audio.type).toBe("choice");
        expect(body.state.renderer.id).toBe(renderer);
        expect(body.state.renderer.audio.generatesMusic).toBe(false);
        expect(body.state.renderer.audio.integration).toBe(
          renderer === "multiplane" ? "single_premixed_file" : "composition_media_tracks",
        );
        expect(body.state.renderer.visuals.frameContract).toBeTruthy();
        if (renderer === "multiplane")
          expect(body.state.renderer.audio.cliArgument).toBe("--audio");
        if (available) {
          expect(
            body.state.audioStudio.tools[0].inputSchema.properties.duration_seconds.maximum,
          ).toBe(380);
          expect(body.state.audioStudio.instructions).toBe("Native audio operation guidance");
          expect(body.state.audioStudio.modelReadiness).toBe("not_probed");
        }
        expect(Object.keys(body.questions.audio.criteria)).toEqual(
          available ? ["local_audio", "audio_studio"] : ["local_audio"],
        );
        return new Response(
          JSON.stringify({
            model: "jev-test",
            answers: {
              audio: {
                type: "choice",
                choice: winner,
                confidence: 1,
                probabilities: available
                  ? { local_audio: 0.1, audio_studio: 0.9 }
                  : { local_audio: 1 },
              },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }),
    );
    expect(await selectAudioAuthoring(options)).toMatchObject({
      source: "jev",
      selectedId: winner,
    });
    expect(options.request).toEqual(original);
    expect(options.onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "invocation",
      "usage",
    ]);
  },
);
it("excludes a failed MCP probe without dropping the music request", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("JEV_API_KEY", "");
  vi.mocked(audioStudioAvailability).mockRejectedValue(Error("MCP startup failed"));
  const options = input();
  const prompt = options.request.requirements!.music.instructions;
  expect(await selectAudioAuthoring(options)).toMatchObject({ source: "unavailable" });
  expect(options.request.requirements!.music.instructions).toBe(prompt);
});
it("propagates cancellation rather than recording it as a fallback", async () => {
  const options = input();
  const controller = new AbortController();
  controller.abort();
  options.signal = controller.signal;
  await expect(selectAudioAuthoring(options)).rejects.toThrow();
  expect(audioStudioAvailability).not.toHaveBeenCalled();
});
