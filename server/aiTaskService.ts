import { nanoid } from "nanoid";
import { z } from "zod";
import { tasks } from "../drizzle/schema";
import { defaultTaskRule } from "../shared/taskRules";
import { ensureProfile, requireDb } from "./anchorDb";
import { invokeLLM, listLLMModels } from "./_core/llm";

const extractionSchema = z.object({
  polishedText: z.string().max(800),
  tasks: z.array(z.object({ title: z.string().min(1).max(240), notes: z.string().max(1000).nullable(), dueAt: z.string().datetime().nullable(), duePrecision: z.enum(["unknown", "date", "datetime"]), confidence: z.number().min(0).max(1) })).min(1).max(8),
});

export function fallbackTaskExtraction(text: string): z.infer<typeof extractionSchema> {
  return { polishedText: text.trim(), tasks: [{ title: text.trim().slice(0, 240) || "未命名任务", notes: null, dueAt: null, duePrecision: "unknown" as const, confidence: 0.35 }] };
}

export async function createTasksFromNaturalInput(owner: { id: number; name?: string | null }, text: string, language = "zh") {
  const profile = await ensureProfile(owner);
  const now = new Date();
  // 计算用户本地时间，给 LLM 明确的上下文
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: profile.timezone }));
  const localNowStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")} ${String(localNow.getHours()).padStart(2, "0")}:${String(localNow.getMinutes()).padStart(2, "0")}`;
  const weekday = localNow.toLocaleDateString("en-US", { timeZone: profile.timezone, weekday: "long" });
  let extracted: z.infer<typeof extractionSchema> = fallbackTaskExtraction(text);
  try {
    const catalog = await listLLMModels();
    const model = catalog.data.find((item) => item.id === "gpt-5-mini")?.id ?? catalog.data[0]?.id;
    const response = await invokeLLM({
      model,
      messages: [
        { role: "system", content: `You extract spoken or typed task notes into strict JSON.

CRITICAL TIME RULES:
- The user's timezone is ${profile.timezone}.
- Current LOCAL time in user's timezone: ${localNowStr} (${weekday}).
- Current UTC instant: ${now.toISOString()}.
- "明天" / "tomorrow" means the day AFTER the current local date (${localNowStr.slice(0,10)}), i.e. ${new Date(localNow.getTime() + 86400000).toISOString().slice(0,10)}.
- "后天" / "day after tomorrow" means 2 days after the current local date.
- "今天" / "today" means the current local date.
- "下周X" means next week's day X.
- When the user says "X点" or "X:XX", combine it with the relative date they specified. Do NOT default to today.
- Convert the resolved local time to ISO-8601 UTC for the dueAt field.
- If time is absent or uncertain, return dueAt=null and duePrecision=unknown.
- Never invent a deadline.

TASK RULES:
- Split only when there are distinct actionable tasks.
- Rewrite each title as concise verb + object.
- Output Chinese if language is zh, English if language is en.` },
        { role: "user", content: text },
      ],
      response_format: { type: "json_schema", json_schema: { name: "task_extraction", strict: true, schema: { type: "object", properties: { polishedText: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, notes: { type: ["string", "null"] }, dueAt: { type: ["string", "null"] }, duePrecision: { type: "string", enum: ["unknown", "date", "datetime"] }, confidence: { type: "number" } }, required: ["title", "notes", "dueAt", "duePrecision", "confidence"], additionalProperties: false } } }, required: ["polishedText", "tasks"], additionalProperties: false } } },
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content === "string") extracted = extractionSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn("[AI capture] Structured extraction fell back to direct task capture", String(error));
  }
  const db = await requireDb();
  const created = [];
  for (const task of extracted.tasks) {
    const dueAt = task.dueAt ? new Date(task.dueAt) : null;
    const defaults = defaultTaskRule(now, dueAt, profile.timezone);
    const row = { id: nanoid(), ownerId: owner.id, title: task.title, notes: task.notes, dueAt, duePrecision: task.duePrecision, ...defaults };
    await db.insert(tasks).values(row);
    created.push(row);
  }
  return { originalText: text, polishedText: extracted.polishedText, tasks: created, usedFallback: extracted.tasks.some((task) => task.confidence <= 0.35) };
}
