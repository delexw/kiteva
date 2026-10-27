import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SpeechSettingsSchema,
  SpeechProviderIdSchema,
  speechVoices,
  speechLanguage,
  speechVoiceDefinition,
  PocketLanguageSchema,
} from "../../shared/speech";
import { CodedError } from "../../shared/errors";
import { dataRoot } from "../runtime/config";
import { narrationAudioRevision } from "./narration-level";
import { speechReadiness, synthesizeSpeech } from "./speech";

export function registerSpeechRoutes(app: FastifyInstance) {
  const folder = path.join(dataRoot, "speech-samples");
  app.get<{ Querystring: { engine?: string; voice?: string; language?: string } }>(
    "/api/speech/status",
    (req) =>
      speechReadiness(
        AbortSignal.timeout(35000),
        SpeechProviderIdSchema.default("kokoro").parse(req.query.engine),
        z
          .enum(speechVoices.map((voice) => voice.id))
          .optional()
          .parse(req.query.voice),
        PocketLanguageSchema.optional().parse(req.query.language),
      ),
  );
  app.post("/api/speech/sample", async (req) => {
    const settings = SpeechSettingsSchema.parse(req.body);
    if (settings.mode !== "narration")
      throw new CodedError("INVALID_REQUEST", "Choose a narrator voice.");
    const id = createHash("sha256")
      .update(
        JSON.stringify({
          engine: settings.engine || "kokoro",
          voice: settings.voice,
          voiceDefinition: speechVoiceDefinition(settings),
          language: settings.language,
          speed: settings.speed,
          volume: settings.volume ?? 1,
          revision: narrationAudioRevision,
        }),
      )
      .digest("hex");
    const file = path.join(folder, `${id}.wav`);
    try {
      await access(file);
    } catch {
      const samples: Record<string, string> = {
        en: "Let's bring your idea to life.",
        "en-us": "Let's bring your idea to life.",
        "en-gb": "Let's bring your idea to life.",
        fr: "Donnons vie à vos idées.",
        "fr-fr": "Donnons vie à vos idées.",
        de: "Erwecken wir deine Idee zum Leben.",
        pt: "Vamos dar vida à sua ideia.",
        it: "Diamo vita alla tua idea.",
        es: "Demos vida a tus ideas.",
        nl: "Laten we je idee tot leven brengen.",
        ja: "あなたのアイデアを形にしましょう。",
        zh: "让你的创意成为现实，用自然清晰的中文，讲述属于你的故事。",
      };
      const sample = samples[speechLanguage(settings.voice, settings.engine, settings.language)!];
      await synthesizeSpeech(
        sample,
        file,
        settings.voice,
        settings.speed,
        AbortSignal.timeout(330000),
        settings.engine,
        settings.language,
        settings.volume ?? 1,
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
