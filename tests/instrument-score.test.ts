import midiPackage from "@tonejs/midi";
import { expect, it } from "vitest";
import { InstrumentScoreSchema, scoreToMidi } from "../src/server/audio/instruments/score";
const { Midi } = midiPackage;
const part = {
  name: "Piano",
  program: 0,
  notes: [{ midi: 60, time: 1, duration: 0.5, velocity: 0.75 }],
};
const score = { title: "Example score", durationSeconds: 4, bpm: 120, tracks: [part] };
it("round-trips timed notes, instruments, dynamics, pan and pedal through an actual MIDI parser", () => {
  const input = InstrumentScoreSchema.parse({
    ...score,
    bpm: 90,
    tracks: [
      {
        ...part,
        pan: -1,
        volume: 0.6,
        expression: [{ time: 1, value: 0.4 }],
        sustain: [
          { time: 0, value: 1 },
          { time: 2, value: 0 },
        ],
      },
    ],
  });
  const bytes = scoreToMidi(input);
  expect(scoreToMidi(input)).toEqual(bytes);
  const parsed = new Midi(bytes);
  const track = parsed.tracks[0];
  expect(parsed.header.tempos[0].bpm).toBeCloseTo(90, 3);
  expect(track.notes[0].time).toBeCloseTo(1, 2);
  expect(track.notes[0].duration).toBeCloseTo(0.5, 2);
  expect(track.notes[0].velocity).toBeCloseTo(0.75, 1);
  expect(track.instrument.number).toBe(0);
  expect(track.controlChanges[7][0].value).toBeCloseTo(0.6, 1);
  expect(track.controlChanges[10][0].value).toBe(0);
  expect(track.controlChanges[11][0].time).toBeCloseTo(1, 2);
  expect(track.controlChanges[64].at(-1)?.value).toBe(0);
  expect(parsed.header.ticksToSeconds(track.endOfTrackTicks!)).toBeCloseTo(4, 2);
});
it("allocates all 15 melodic channels around the dedicated percussion channel", () => {
  const parsed = new Midi(
    scoreToMidi(
      InstrumentScoreSchema.parse({
        ...score,
        tracks: [{ ...part, percussion: true }, ...Array.from({ length: 15 }, () => part)],
      }),
    ),
  );
  expect(parsed.tracks[0].channel).toBe(9);
  expect(parsed.tracks[0].instrument.percussion).toBe(true);
  expect(parsed.tracks.slice(1).map((track) => track.channel)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15,
  ]);
});
it.each([
  { ...score, tracks: [{ ...part, notes: [{ midi: 60, time: 3.9, duration: 1, velocity: 0.5 }] }] },
  { ...score, tracks: [{ ...part, program: 128 }] },
  { ...score, tracks: [{ ...part, sustain: [{ time: 5, value: 1 }] }] },
  {
    ...score,
    tracks: [
      { ...part, percussion: true },
      { ...part, percussion: true },
    ],
  },
  { ...score, tracks: Array.from({ length: 16 }, () => part) },
  { ...score, bpm: 1 },
  { ...score, tracks: [{ ...part, notes: [{ midi: 60, time: 0, duration: 1, velocity: 0 }] }] },
])("rejects invalid timing, MIDI values and channel configurations", (input) => {
  expect(InstrumentScoreSchema.safeParse(input).success).toBe(false);
});
it("rejects notes shorter than the actual MIDI resolution", () => {
  const input = InstrumentScoreSchema.parse({
    ...score,
    tracks: [{ ...part, notes: [{ midi: 60, time: 0, duration: 0.000001, velocity: 0.5 }] }],
  });
  expect(() => scoreToMidi(input)).toThrow("MIDI resolution");
});
