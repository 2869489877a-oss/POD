import type { ImageCollectionTemplate } from "@/types/image-collector";

type ScheduleTemplate = Pick<
  ImageCollectionTemplate,
  "cron_expression" | "last_run_at" | "next_run_at" | "schedule_enabled" | "status"
>;

type CronField = {
  values: Set<number>;
};

type ParsedCron = {
  dayOfMonth: CronField;
  dayOfWeek: CronField;
  hour: CronField;
  minute: CronField;
  month: CronField;
};

const SIMPLE_FREQUENCIES = new Set(["manual", "hourly", "daily", "weekly"]);

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfNextHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return addHours(next, 1);
}

function startOfNextDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return addDays(next, 1);
}

function startOfNextWeek(date: Date) {
  const next = startOfNextDay(date);
  const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
  return addDays(next, daysUntilMonday);
}

function parseNumber(value: string, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`cron 字段 ${value} 超出范围`);
  }

  return parsed;
}

function expandCronPart(part: string, min: number, max: number) {
  const values = new Set<number>();
  const [rangePart, stepPart] = part.split("/");
  const step = stepPart ? parseNumber(stepPart, 1, max - min + 1) : 1;

  if (rangePart === "*") {
    for (let value = min; value <= max; value += step) {
      values.add(value);
    }

    return values;
  }

  if (rangePart.includes("-")) {
    const [startRaw, endRaw] = rangePart.split("-");
    const start = parseNumber(startRaw ?? "", min, max);
    const end = parseNumber(endRaw ?? "", min, max);

    if (start > end) {
      throw new Error(`cron 范围无效：${part}`);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }

    return values;
  }

  values.add(parseNumber(rangePart, min, max));
  return values;
}

function parseCronField(raw: string, min: number, max: number): CronField {
  const values = new Set<number>();

  for (const part of raw.split(",")) {
    const trimmed = part.trim();

    if (!trimmed) {
      throw new Error("cron 字段不能为空");
    }

    for (const value of expandCronPart(trimmed, min, max)) {
      values.add(value);
    }
  }

  return { values };
}

function parseDayOfWeekField(raw: string) {
  const field = parseCronField(raw, 0, 7);

  if (field.values.has(7)) {
    field.values.add(0);
    field.values.delete(7);
  }

  return field;
}

function fieldMatches(field: CronField, value: number) {
  return field.values.has(value);
}

function cronMatches(cron: ParsedCron, date: Date) {
  return (
    fieldMatches(cron.minute, date.getMinutes()) &&
    fieldMatches(cron.hour, date.getHours()) &&
    fieldMatches(cron.dayOfMonth, date.getDate()) &&
    fieldMatches(cron.month, date.getMonth() + 1) &&
    fieldMatches(cron.dayOfWeek, date.getDay())
  );
}

export function parseCronExpression(expression: string | null | undefined) {
  const value = expression?.trim() || "manual";

  if (SIMPLE_FREQUENCIES.has(value)) {
    return {
      frequency: value as "manual" | "hourly" | "daily" | "weekly",
      parsed: null,
    };
  }

  const parts = value.split(/\s+/);

  if (parts.length !== 5) {
    throw new Error("自定义 cron 必须是 5 段表达式，例如 */30 * * * *");
  }

  return {
    frequency: "custom" as const,
    parsed: {
      dayOfMonth: parseCronField(parts[2] ?? "*", 1, 31),
      dayOfWeek: parseDayOfWeekField(parts[4] ?? "*"),
      hour: parseCronField(parts[1] ?? "*", 0, 23),
      minute: parseCronField(parts[0] ?? "*", 0, 59),
      month: parseCronField(parts[3] ?? "*", 1, 12),
    },
  };
}

export function calculateNextRunAt(template: ScheduleTemplate, now = new Date()) {
  if (!template.schedule_enabled || template.status !== "active") {
    return null;
  }

  const schedule = parseCronExpression(template.cron_expression);

  if (schedule.frequency === "manual") {
    return null;
  }

  if (schedule.frequency === "hourly") {
    return startOfNextHour(now).toISOString();
  }

  if (schedule.frequency === "daily") {
    return startOfNextDay(now).toISOString();
  }

  if (schedule.frequency === "weekly") {
    return startOfNextWeek(now).toISOString();
  }

  if (!schedule.parsed) {
    return null;
  }

  let candidate = addMinutes(new Date(now), 1);
  candidate.setSeconds(0, 0);

  for (let index = 0; index < 60 * 24 * 366; index += 1) {
    if (cronMatches(schedule.parsed, candidate)) {
      return candidate.toISOString();
    }

    candidate = addMinutes(candidate, 1);
  }

  throw new Error("无法计算下一次自动运行时间，请检查 cron 表达式");
}

export function shouldRunTemplate(template: ScheduleTemplate, now = new Date()) {
  if (!template.schedule_enabled || template.status !== "active") {
    return false;
  }

  const schedule = parseCronExpression(template.cron_expression);

  if (schedule.frequency === "manual") {
    return false;
  }

  if (!template.next_run_at) {
    return true;
  }

  return new Date(template.next_run_at).getTime() <= now.getTime();
}
