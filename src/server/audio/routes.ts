import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SpeechSettingsSchema } from "../../shared/speech";
import { CodedError } from "../../shared/errors";
import { dataRoot } from "../runtime/config";
import { speechReadiness, synthesizeSpeech } from "./speech";

export function registerSpeechRoutes(app: FastifyInstance) {
  const folder = path.join(dataRoot, "speech-samples");
  app.get("/api/speech/status", () => speechReadiness(AbortSignal.timeout(35000)));
  app.post("/api/speech/sample", async (req) => {
    const settings = SpeechSettingsSchema.parse(req.body);
    if (settings.mode !== "narration")
      throw new CodedError("INVALID_REQUEST", "Choose a narrator voice.");
    const id = createHash("sha256")
      .update(JSON.stringify({ voice: settings.voice, speed: settings.speed, revision: 1 }))
      .digest("hex");
    const file = path.join(folder, `${id}.wav`);
    try {
      await access(file);
    } catch {
      const sample = settings.voice.startsWith("z")
        ? "让你的创意成为现实。"
        : settings.voice.startsWith("j")
          ? "あなたのアイデアを形にしましょう。"
          : settings.voice.startsWith("f")
            ? "Donnons vie à vos idées."
            : settings.voice.startsWith("e")
              ? "Demos vida a tus ideas."
              : "Let's bring your idea to life.";
      await synthesizeSpeech(
        sample,
        file,
        settings.voice,
        settings.speed,
        AbortSignal.timeout(330000),
      );
    }
    return { url: `/api/speech/samples/${id}` };
  });
  app.get<{ Params: { id: string } }>("/api/speech/samples/:id", async (req, reply) => {
    const id = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(req.params.id);
    const file = path.join(folder, `${id}.wav`);
    try {
      await access(file);
    } catch {
      throw new CodedError("NOT_FOUND", "Voice sample not ready.", 404);
    }
    return reply.type("audio/wav").send(createReadStream(file));
  });
}
