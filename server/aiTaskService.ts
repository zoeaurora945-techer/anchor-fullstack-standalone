import { nanoid } from "nanoid";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tasks, projects } from "../drizzle/schema";
import { defaultTaskRule } from "../shared/taskRules";
import { ensureProfile, requireDb } from "./anchorDb";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { parseNaturalTask, zonedNow, type ProjectRef } from "./parseNatural";

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
  // 取用户本地"此刻"的日历视图，供规则解析器判断今天/明天
  const localNow = zonedNow(profile.timezone);
  const localNowStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")} ${String(localNow.getHours()).padStart(2, "0")}:${String(localNow.getMinutes()).padStart(2, "0")}`;
  const weekday = localNow.toLocaleDateString("en-US", { timeZone: profile.timezone, weekday: "long" });

  // 先拉取当前用户的项目，用于规则解析阶段做项目关联
  const db = await requireDb();
  const projectRows = await db.select({ id: projects.id, title: projects.title }).from(projects).where(eq(projects.ownerId, owner.id));
  const projectRefs: ProjectRef[] = projectRows.map((p) => ({ id: p.id, title: p.title }));

  // 规则化解析（无需 LLM，保证时间 + 项目一定能被拆解）
  const base = parseNaturalTask(text, localNow, profile.timezone, projectRefs);

  let extracted: z.infer<typeof extractionSchema> = fallbackTaskExtraction(text);
  const hasLLM = Boolean(process.env.OPENAI_API_KEY);
  try {
    if (!hasLLM) throw new Error("OPENAI_API_KEY not configured; using rule-based parser");
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
    console.warn("[AI capture] Structured extraction fell back to rule-based parser", String(error));
  }

  // 组装最终任务：LLM 优先，规则解析兜底时间与项目
  const llmTasks = extracted.tasks;
  const finalTasks = llmTasks.map((task) => {
    // LLM 没解析出时间时，复用规则解析的时间
    const dueAt = task.dueAt ? new Date(task.dueAt) : base.dueAt;
    const duePrecision = task.dueAt ? task.duePrecision : base.duePrecision;
    // 项目关联：优先用规则解析命中的 projectId，否则按 LLM 任务标题再匹配一次
    const projectId = base.projectId ?? matchProjectTitle(task.title, projectRefs);
    return { title: task.title, notes: task.notes, dueAt, duePrecision, projectId };
  });

  // 异常情况（无 LLM 任务）兜底：直接用规则解析的单一任务
  const tasksToCreate = finalTasks.length ? finalTasks : [{
    title: base.title || text.trim().slice(0, 240) || "未命名任务",
    notes: null as string | null,
    dueAt: base.dueAt,
    duePrecision: base.duePrecision,
    projectId: base.projectId,
  }];

  const created = [];
  for (const task of tasksToCreate) {
    const defaults = defaultTaskRule(now, task.dueAt, profile.timezone);
    const row = {
      id: nanoid(),
      ownerId: owner.id,
      title: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      duePrecision: task.duePrecision,
      projectId: task.projectId ?? null,
      ...defaults,
    };
    await db.insert(tasks).values(row);
    created.push(row);
  }
  return { originalText: text, polishedText: extracted.polishedText, tasks: created, usedFallback: extracted.tasks.some((task) => task.confidence <= 0.35) };
}

/** 按任务标题匹配项目（规则解析兜底用）。 */
function matchProjectTitle(title: string, projects: ProjectRef[]): string | null {
  const cleaned = title.trim();
  let best: { id: string; len: number } | null = null;
  for (const p of projects) {
    const t = (p.title || "").trim();
    if (!t) continue;
    if (cleaned.includes(t) && (!best || t.length > best.len)) best = { id: p.id, len: t.length };
  }
  return best?.id ?? null;
}
