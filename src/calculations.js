export const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

// Shifting first and reading UTC fields keeps every result independent of the browser timezone.
export function chinaDate(timestamp = Date.now()) {
  const date = new Date(timestamp + CHINA_OFFSET_MS);
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    seconds: date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds() + date.getUTCMilliseconds() / 1000,
  };
}

export function timeSeconds(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "")) return NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

export function validateConfig(input) {
  const errors = {};
  const salary = Number(input.salary);
  const workStart = input.workStart ?? "";
  const workEnd = input.workEnd ?? "";
  const lunchStart = input.lunchStart ?? "";
  const lunchEnd = input.lunchEnd ?? "";
  const start = timeSeconds(workStart), end = timeSeconds(workEnd);
  if (!Number.isFinite(salary) || salary < 0.01) errors.salary = "请输入至少 0.01 元的月薪";
  else if (!Number.isSafeInteger(Math.round(salary * 100))) errors.salary = "月薪数值过大，请检查输入";
  else if (Math.abs(salary * 100 - Math.round(salary * 100)) > 0.001) errors.salary = "月薪最多保留两位小数";
  if (!Number.isFinite(start)) errors.workStart = "请选择上班时间";
  if (!Number.isFinite(end)) errors.workEnd = "请选择下班时间";
  else if (Number.isFinite(start) && end <= start) errors.workEnd = "下班须晚于上班，暂支持当天作息";
  if (lunchStart || lunchEnd) {
    const lunchFrom = timeSeconds(lunchStart), lunchTo = timeSeconds(lunchEnd);
    if (!Number.isFinite(lunchFrom)) errors.lunchStart = "请补全午休开始时间";
    if (!Number.isFinite(lunchTo)) errors.lunchEnd = "请补全午休结束时间";
    if (Number.isFinite(lunchFrom) && Number.isFinite(lunchTo)) {
      if (lunchTo <= lunchFrom) errors.lunchEnd = "午休结束须晚于开始";
      else if (Number.isFinite(start) && Number.isFinite(end)) {
        if (lunchFrom < start) errors.lunchStart = "午休须在上班后开始";
        if (lunchTo > end) errors.lunchEnd = "午休须在下班前结束";
        if (end - start - (lunchTo - lunchFrom) <= 0) errors.lunchEnd = "请保留大于 0 的有效工作时间";
      }
    }
  }
  return {
    errors,
    config: Object.keys(errors).length ? null : { salary, workStart, workEnd, lunchStart, lunchEnd, singleRest: input.singleRest === true },
  };
}

export function countWorkdays(year, month, singleRest = false) {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= days; day++) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (weekday !== 0 && (singleRest || weekday !== 6)) count++;
  }
  return count;
}

export function workSeconds(config) {
  const lunch = config.lunchStart ? timeSeconds(config.lunchEnd) - timeSeconds(config.lunchStart) : 0;
  return timeSeconds(config.workEnd) - timeSeconds(config.workStart) - lunch;
}

export function monthMetrics(config, timestamp = Date.now()) {
  const { year, month } = chinaDate(timestamp);
  const days = countWorkdays(year, month, config.singleRest);
  const seconds = workSeconds(config);
  const dailySalary = config.salary / days;
  return { year, month, days, seconds, dailySalary, perSecond: dailySalary / seconds, integerDigits: dailySalary >= 1000 ? 4 : 3 };
}

export function dailyIncome(config, timestamp = Date.now()) {
  const date = chinaDate(timestamp);
  const metrics = monthMetrics(config, timestamp);
  const start = timeSeconds(config.workStart), end = timeSeconds(config.workEnd);
  const dayOff = date.weekday === 0 || (!config.singleRest && date.weekday === 6);
  if (dayOff) return { status: "rest", amount: 0, metrics };
  const cutoff = Math.max(start, Math.min(end, date.seconds));
  let elapsed = cutoff - start;
  let status = date.seconds < start || date.seconds >= end ? "rest" : "working";
  if (config.lunchStart) {
    const lunchFrom = timeSeconds(config.lunchStart), lunchTo = timeSeconds(config.lunchEnd);
    elapsed -= Math.max(0, Math.min(cutoff, lunchTo) - lunchFrom);
    if (date.seconds >= lunchFrom && date.seconds < lunchTo) status = "lunch";
  }
  return { status, amount: Math.min(metrics.dailySalary, Math.max(0, elapsed) * metrics.perSecond), metrics };
}

// Manual time is paid at each month's rate, regardless of weekday or working hours.
export function incomeBetween(config, from, to) {
  if (to <= from) return 0;
  let cursor = from, amount = 0;
  while (cursor < to) {
    const { year, month, perSecond } = monthMetrics(config, cursor);
    const nextMonth = Date.UTC(year, month + 1, 1) - CHINA_OFFSET_MS;
    const end = Math.min(nextMonth, to);
    if (end <= cursor) break;
    amount += (end - cursor) / 1000 * perSecond;
    cursor = end;
  }
  return amount;
}
