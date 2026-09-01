import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { createTasksFromNaturalInput } from "../aiTaskService";
import { transcribeAudio } from "../_core/voiceTranscription";
import { protectedProcedure, router } from "../_core/trpc";

export const aiRouter = router({
  captureText: protectedProcedure.input(z.object({ text: z.string().trim().min(1).max(8000), language: z.enum(["zh", "en"]).default("zh") })).mutation(async ({ ctx, input }) =>
    createTasksFromNaturalInput(ctx.user, input.text, input.language)),
  captureVoice: protectedProcedure.input(z.object({ audioBase64: z.string().min(1), mimeType: z.enum(["audio/webm", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a"]), language: z.enum(["zh", "en"]).default("zh") })).mutation(async ({ ctx, input }) => {
    const bytes = Buffer.from(input.audioBase64, "base64");
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("录音不能超过 16MB");
    const extension = input.mimeType.split("/")[1].replace("mpeg", "mp3");
    const uploaded = await storagePut(`audio/${ctx.user.id}/${Date.now()}-${nanoid()}.${extension}`, bytes, input.mimeType);
    const transcript = await transcribeAudio({ audioUrl: uploaded.url, language: input.language, prompt: "Personal task and time planning note" });
    if ("error" in transcript) throw new Error(String(transcript.error));
    const result = await createTasksFromNaturalInput(ctx.user, transcript.text, input.language);
    return { transcript: transcript.text, ...result };
  }),
});
