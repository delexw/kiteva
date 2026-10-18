import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ status: vi.fn(), render: vi.fn() }));
vi.mock("../src/server/audio/instruments/fluidsynth", () => ({
  instrumentReadiness: calls.status,
  renderInstrumental: calls.render,
}));
import { createInstrumentTools } from "../src/server/agents/capabilities/instruments-tools";
import { agentCapabilities } from "../src/server/agents/capabilities/registry";
it.each([true, false])(
  "exposes instrument rendering only for writable builds (readOnly=%s)",
  async (readOnly) => {
    calls.status.mockResolvedValue({ available: true, message: "Ready" });
    calls.render.mockClear();
    calls.render.mockResolvedValue({
      audioFile: "instrumental-test/music.wav",
      midiFile: "instrumental-test/music.mid",
      scoreFile: "instrumental-test/score.json",
      provenanceFile: "instrumental-test/provenance.json",
      durationSeconds: 4,
      sampleRate: 48000,
    });
    const server = createInstrumentTools({
      workspace: "/job",
      readOnly,
      signal: new AbortController().signal,
    });
    const client = new Client({ name: "test", version: "1" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(s);
      await client.connect(c);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        "instrument_status",
        ...(!readOnly ? ["render_instrumental"] : []),
      ]);
      expect(
        (await client.callTool({ name: "instrument_status", arguments: {} })).structuredContent,
      ).toMatchObject({ kind: "status", available: true });
      const result = await client.callTool({
        name: "render_instrumental",
        arguments: {
          score: {
            title: "Example",
            bpm: 120,
            durationSeconds: 4,
            tracks: [
              {
                name: "Piano",
                program: 0,
                notes: [{ midi: 60, time: 0, duration: 1, velocity: 0.5 }],
              },
            ],
          },
        },
      });
      if (readOnly) {
        expect(result.isError).toBe(true);
        expect(calls.render).not.toHaveBeenCalled();
      } else {
        expect(result.structuredContent).toMatchObject({
          kind: "rendered",
          audioFile: "instrumental-test/music.wav",
        });
        expect(calls.render.mock.calls[0][0]).toBe("/job");
      }
    } finally {
      await client.close();
      await server.close();
    }
  },
);
it("keeps silent-preview permissions independent of component installation, voice and renderer", () => {
  const preview = agentCapabilities("/job", false, false, false);
  expect(preview.servers.instruments.enabledTools).toEqual(["instrument_status"]);
  expect(preview.servers.react_bits.enabledTools).toContain("install_component");
  expect(agentCapabilities("/job").servers.instruments.enabledTools).toContain(
    "render_instrumental",
  );
  expect(agentCapabilities("/job", false, true).servers).toEqual({});
  expect(preview.guidance).toContain(
    "Existing Music and Narration / lyrics settings are authoritative",
  );
});
