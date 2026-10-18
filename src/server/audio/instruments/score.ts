import midiPackage from "@tonejs/midi";
const { Midi } = midiPackage;
import { z } from "zod";
import { MAX_VIDEO_DURATION } from "../../../shared/agents/schemas/video";

const timedControl = z.object({ time: z.number().nonnegative(), value: z.number().min(0).max(1) });
export const InstrumentScoreSchema = z
  .object({
    title: z.string().trim().min(1),
    durationSeconds: z.number().positive().max(MAX_VIDEO_DURATION),
    bpm: z.number().positive().max(60000000), // MIDI's microseconds-per-quarter-note representation.
    tracks: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          program: z
            .number()
            .int()
            .min(0)
            .max(127)
            .describe("Zero-based General MIDI program; piano=0, bass=32, strings=48"),
          percussion: z.boolean().default(false),
          volume: z.number().min(0).max(1).default(0.8),
          pan: z.number().min(-1).max(1).default(0),
          notes: z
            .array(
              z.object({
                midi: z.number().int().min(0).max(127),
                time: z.number().nonnegative().describe("Absolute seconds on the video timeline"),
                duration: z.number().positive(),
                velocity: z
                  .number()
                  .min(1 / 127)
                  .max(1),
              }),
            )
            .min(1),
          expression: z
            .array(timedControl)
            .default([])
            .describe("Timed MIDI CC11 dynamics, values 0–1"),
          sustain: z.array(timedControl).default([]).describe("Timed MIDI CC64 pedal, 0=off, 1=on"),
        }),
      )
      .min(1)
      .max(16), // General MIDI has 16 channels, with channel 10 reserved for percussion.
  })
  .superRefine((score, context) => {
    if (60000000 / score.bpm > 0xffffff)
      context.addIssue({
        code: "custom",
        path: ["bpm"],
        message: "Tempo cannot be represented in a standard MIDI file",
      });
    if (
      score.tracks.filter((track) => track.percussion).length > 1 ||
      score.tracks.filter((track) => !track.percussion).length > 15
    )
      context.addIssue({
        code: "custom",
        path: ["tracks"],
        message: "Use at most 15 melodic tracks and one percussion track",
      });
    score.tracks.forEach((track, trackIndex) => {
      track.notes.forEach((note, index) => {
        if (note.time + note.duration > score.durationSeconds + 1e-9)
          context.addIssue({
            code: "custom",
            path: ["tracks", trackIndex, "notes", index],
            message: "Note extends beyond the score duration",
          });
      });
      for (const field of ["expression", "sustain"] as const)
        track[field].forEach((control, index) => {
          if (control.time > score.durationSeconds)
            context.addIssue({
              code: "custom",
              path: ["tracks", trackIndex, field, index],
              message: "Control extends beyond the score duration",
            });
        });
    });
  });
export type InstrumentScore = z.infer<typeof InstrumentScoreSchema>;

/** Seconds remain authoritative; the library performs tempo-aware MIDI tick conversion. */
export function scoreToMidi(input: InstrumentScore) {
  const score = InstrumentScoreSchema.parse(input);
  const midi = new Midi();
  midi.name = score.title;
  midi.header.tempos = [{ ticks: 0, bpm: score.bpm }];
  midi.header.update();
  if (midi.header.secondsToTicks(score.durationSeconds) > 0x0fffffff)
    throw Error("Score timing exceeds standard MIDI tick range at this tempo");
  let channel = 0;
  for (const part of score.tracks) {
    const track = midi.addTrack();
    track.name = part.name;
    if (channel === 9) channel++;
    track.channel = part.percussion ? 9 : channel++;
    track.instrument.number = part.program;
    track.addCC({ number: 7, time: 0, value: part.volume });
    track.addCC({ number: 10, time: 0, value: (part.pan + 1) / 2 });
    for (const note of part.notes) {
      const ticks = midi.header.secondsToTicks(note.time);
      const durationTicks = midi.header.secondsToTicks(note.time + note.duration) - ticks;
      if (durationTicks < 1) throw Error("A note is too short for MIDI resolution at this tempo");
      track.addNote({ midi: note.midi, ticks, durationTicks, velocity: note.velocity });
    }
    for (const control of part.expression) track.addCC({ number: 11, ...control });
    for (const control of part.sustain) track.addCC({ number: 64, ...control });
    track.addCC({ number: 64, time: score.durationSeconds, value: 0 });
    track.endOfTrackTicks = midi.header.secondsToTicks(score.durationSeconds);
  }
  return midi.toArray();
}
