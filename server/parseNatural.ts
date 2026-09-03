/**
 * 规则化的自然语言时间 / 项目解析器（无需 LLM）。
 *
 * 设计目标：
 *  - 把"今天下午五点跑胶""明天 9 点开会""下周一上午 10 点交报告"等中文口语
 *    解析成 { dueAt, duePrecision, title(已去除时间短语), projectId }。
 *  - 当 LLM 未配置（OPENAI_API_KEY 为空）时，作为主解析路径。
 *  - 当 LLM 可用时，作为兜底与 projectId 来源，保证「项目 + 时间」一定能被拆解。
 */

export type ProjectRef = { id: string; title: string };

export type ParsedTask = {
  title: string;
  dueAt: Date | null;
  duePrecision: "unknown" | "date" | "datetime";
  projectId: string | null;
};

const WEEKDAYS_ZH: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};
const WEEKDAYS_EN: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** 中文数字 → 阿拉伯数字（支持 0~99）。 */
function cnToNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (s === "十") return 10;
  if (s.includes("十")) {
    const parts = s.split("十");
    const tens = parts[0] ? digits[parts[0]] ?? 1 : 1;
    const ones = parts[1] ? digits[parts[1]] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return digits[s] ?? NaN;
}

/** 计算某时区在给定 UTC 瞬间下的偏移（毫秒，localWall - utc）。 */
function tzOffsetMs(timezone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asWall = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asWall - at.getTime();
}

/** 把「本地墙上时间」转换为对应时区的 UTC 瞬间。 */
function localToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = tzOffsetMs(timezone, new Date(guess));
  return new Date(guess - offset);
}

/** 返回「此刻」在该时区下的墙上时间（Date 的 getX() 反映当地日历）。 */
export function zonedNow(timezone: string): Date {
  const utc = new Date();
  return new Date(utc.getTime() + tzOffsetMs(timezone, utc));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 解析相对/绝对日期词，返回本地年月日（不含时间）。默认今天。 */
function parseDatePhrase(text: string, now: Date, timezone: string): { year: number; month: number; day: number; explicit: boolean } {
  const lower = text.toLowerCase();
  const numOrCn = "(\\d{1,2}|[零一二两三四五六七八九十]+)";

  // 绝对日期：X月Y号 / X月Y日 / Y号 / Y日
  const absMonth = text.match(new RegExp(numOrCn + "\\s*月\\s*" + numOrCn + "\\s*[号日]"));
  if (absMonth) {
    const m = cnToNum(absMonth[1]);
    const d = cnToNum(absMonth[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { year: now.getFullYear(), month: m, day: d, explicit: true };
    }
  }
  const absDay = text.match(new RegExp(numOrCn + "\\s*[号日]"));
  if (absDay) {
    const d = cnToNum(absDay[1]);
    if (d >= 1 && d <= 31) {
      return { year: now.getFullYear(), month: now.getMonth() + 1, day: d, explicit: true };
    }
  }

  // 下周X / 下星期X / 下礼拜X
  const nextWeek = lower.match(/下周[期拜]?\s*([日天一二三四五六])/) || lower.match(/next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (nextWeek) {
    const wd = nextWeek[1] in WEEKDAYS_ZH ? WEEKDAYS_ZH[nextWeek[1]] : WEEKDAYS_EN[nextWeek[1]];
    const diff = (wd - now.getDay() + 7) % 7;
    const t = addDays(startOfDay(now), diff + 7); // 再推一周
    return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true };
  }

  // 周X / 星期X / 礼拜X（无"下"）：取接下来 7 天内的出现
  const weekday = lower.match(/周[期拜]?\s*([日天一二三四五六])/) || lower.match(/(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (weekday) {
    const wd = weekday[1] in WEEKDAYS_ZH ? WEEKDAYS_ZH[weekday[1]] : WEEKDAYS_EN[weekday[1]];
    let diff = (wd - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    const t = addDays(startOfDay(now), diff);
    return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true };
  }

  // 相对日
  if (/(大后天)/.test(text)) { const t = addDays(startOfDay(now), 3); return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true }; }
  if (/(后天)/.test(text)) { const t = addDays(startOfDay(now), 2); return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true }; }
  if (/(明天|明日)/.test(text)) { const t = addDays(startOfDay(now), 1); return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true }; }
  if (/(今天|今日|当天)/.test(text)) { const t = startOfDay(now); return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true }; }
  if (/(昨天|昨日)/.test(text)) { const t = addDays(startOfDay(now), -1); return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: true }; }

  const t = startOfDay(now);
  return { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), explicit: false };
}

/** 解析时间-of-day，返回 24h 小时/分钟 + 原文匹配片段（用于去标题）。未匹配返回 null。 */
function parseTimePhrase(text: string): { hour: number; minute: number; raw: string } | null {
  // 1) "X:XX" / "XX:XX" 直接作为 24h
  const colon = text.match(/(\d{1,2}):(\d{2})/);
  if (colon) {
    const h = Number(colon[1]); const m = Number(colon[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m, raw: colon[0] };
  }

  // 2) 时段词 + 点数（支持中文数字 + 可选空格）
  const period = text.match(/(凌晨|清晨|早上|早晨|上午|中午|正午|下午|傍晚|晚上|夜里|夜晚)?\s*([0-9零一二两三四五六七八九十]+)\s*点\s*(半|([0-9零一二两三四五六七八九十]+)\s*分?)?/);
  if (period && period[2]) {
    const p = period[1];
    let h = cnToNum(period[2]);
    let m = 0;
    if (period[3] === "半") m = 30;
    else if (period[4]) m = cnToNum(period[4]);
    if (!Number.isNaN(h) && h >= 0 && h <= 12) {
      if (p === "中午" || p === "正午") h = 12;
      else if (p === "下午" || p === "傍晚" || p === "晚上" || p === "夜里" || p === "夜晚") {
        if (h !== 12) h += 12; // 下午1点=13, 下午5点=17, 晚上8点=20
      } else if (p === "凌晨" || p === "清晨" || p === "早上" || p === "早晨" || p === "上午") {
        if (h === 12) h = 0; // 上午12点=0
      }
      return { hour: h, minute: m, raw: period[0] };
    }
  }

  // 3) 纯 "X点(半/X分)"（视为 24h）
  const plain = text.match(/([0-9零一二两三四五六七八九十]+)\s*点\s*(半|([0-9零一二两三四五六七八九十]+)\s*分?)?/);
  if (plain) {
    let h = cnToNum(plain[1]);
    let m = 0;
    if (plain[2] === "半") m = 30;
    else if (plain[3]) m = cnToNum(plain[3]);
    if (!Number.isNaN(h) && h >= 0 && h <= 23) return { hour: h, minute: m, raw: plain[0] };
  }

  return null;
}

/** 从文本里匹配项目（最长标题优先），返回 projectId。 */
export function matchProject(text: string, projects: ProjectRef[]): string | null {
  const cleaned = text.trim();
  let best: { id: string; len: number } | null = null;
  for (const p of projects) {
    const title = (p.title || "").trim();
    if (!title) continue;
    if (cleaned.includes(title)) {
      if (!best || title.length > best.len) best = { id: p.id, len: title.length };
    }
  }
  return best?.id ?? null;
}

/**
 * 解析一条自然语言任务文本。
 */
export function parseNaturalTask(text: string, now: Date, timezone: string, projects: ProjectRef[]): ParsedTask {
  const date = parseDatePhrase(text, now, timezone);
  const time = parseTimePhrase(text);

  let dueAt: Date | null = null;
  let duePrecision: ParsedTask["duePrecision"] = "unknown";

  if (time) {
    dueAt = localToUtc(date.year, date.month, date.day, time.hour, time.minute, timezone);
    duePrecision = "datetime";
  } else if (date.explicit) {
    dueAt = localToUtc(date.year, date.month, date.day, 23, 59, timezone);
    duePrecision = "date";
  }

  // 去除已解析的日期/时间短语（用原文精确片段，兼容空格）
  let title = text;
  const dateStrip = text.match(/(大后天|后天|明天|今日|今天|当天|昨天|昨日|下周[期拜]?[日天一二三四五六]|周[期拜]?[日天一二三四五六]|(\d{1,2}|[零一二两三四五六七八九十]+)\s*月\s*(\d{1,2}|[零一二两三四五六七八九十]+)\s*[号日]|(\d{1,2}|[零一二两三四五六七八九十]+)\s*[号日])/);
  const phrases = [time?.raw, dateStrip?.[0]].filter(Boolean) as string[];
  for (const ph of phrases) {
    title = title.split(ph).join(" ");
  }
  title = title.replace(/\s{2,}/g, " ").replace(/[,，。.、]+$/g, "").trim();
  if (!title) title = text.trim();

  const projectId = matchProject(text, projects);

  return { title, dueAt, duePrecision, projectId };
}
