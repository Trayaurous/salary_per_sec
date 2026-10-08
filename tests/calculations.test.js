import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chinaDate, countWorkdays, validateConfig, workSeconds, monthMetrics, dailyIncome, incomeBetween } from "../src/calculations.js";

const config = { salary: 10000, workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00", singleRest: false };
const at = text => Date.parse(`${text}+08:00`);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("东八区午夜决定日期、星期与月份", () => {
  const before = chinaDate(Date.parse("2026-09-30T15:59:59.999Z"));
  const after = chinaDate(Date.parse("2026-09-30T16:00:00Z"));
  assert.deepEqual([before.month, before.day], [8, 30]);
  assert.deepEqual([after.month, after.day, after.weekday, after.seconds], [9, 1, 4, 0]);
});
test("大小月、闰年与单双休正确计数", () => {
  assert.equal(countWorkdays(2026, 9), 22);
  assert.equal(countWorkdays(2026, 9, true), 27);
  assert.equal(countWorkdays(2026, 1), 20);
  assert.equal(countWorkdays(2024, 1), 21);
  assert.equal(countWorkdays(2024, 1, true), 25);
});
test("浏览器所在时区不改变东八区收入", () => {
  const script = `import {dailyIncome} from './src/calculations.js'; console.log(JSON.stringify(dailyIncome(${JSON.stringify(config)}, ${at("2026-02-02T10:30:00")})));`;
  const results = ["Asia/Shanghai", "America/New_York", "UTC"].map(TZ => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, TZ } });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  });
  assert.equal(results[0], results[1]); assert.equal(results[1], results[2]);
});
test("午休从每日分母中扣除", () => {
  assert.equal(workSeconds(config), 28800);
  const metrics = monthMetrics(config, at("2026-02-02T10:00:00"));
  assert.equal(metrics.dailySalary, 500);
  near(metrics.perSecond, 500 / 28800);
});
for (const [time, status, amount] of [
  ["08:59:59", "rest", 0], ["09:00:00", "working", 0],
  ["10:30:00", "working", 93.75], ["12:00:00", "lunch", 187.5],
  ["12:59:59", "lunch", 187.5], ["13:00:00", "working", 187.5],
  ["17:00:00", "working", 437.5], ["18:00:00", "rest", 500], ["23:59:59", "rest", 500],
]) test(`作息边界 ${time}：${status}`, () => {
  const income = dailyIncome(config, at(`2026-02-02T${time}`));
  assert.equal(income.status, status); near(income.amount, amount);
});
test("无午休按整段工作时间计算", () => {
  const noLunch = { ...config, lunchStart: "", lunchEnd: "" };
  assert.equal(workSeconds(noLunch), 32400);
  assert.equal(dailyIncome(noLunch, at("2026-02-02T12:30:00")).status, "working");
});
test("单休周六工作，周日仍休息", () => {
  assert.equal(dailyIncome(config, at("2026-10-10T10:00:00")).status, "rest");
  assert.equal(dailyIncome({ ...config, singleRest: true }, at("2026-10-10T10:00:00")).status, "working");
  assert.equal(dailyIncome({ ...config, singleRest: true }, at("2026-10-11T10:00:00")).status, "rest");
});
test("日均收入恰好 1000 时用四位整数", () => {
  assert.equal(monthMetrics({ ...config, salary: 22000 }, at("2026-10-08T10:00:00")).integerDigits, 4);
  assert.equal(monthMetrics({ ...config, salary: 21999 }, at("2026-10-08T10:00:00")).integerDigits, 3);
});
test("跨月计时分别使用两个月的秒薪", () => {
  const from = at("2026-10-31T23:59:30"), to = at("2026-11-01T00:00:30");
  const october = monthMetrics(config, from), november = monthMetrics(config, to);
  near(incomeBetween(config, from, to), 30 * october.perSecond + 30 * november.perSecond);
  assert.notEqual(october.days, november.days);
});
test("手动收入在午休、夜间、休息日均能累加", () => {
  for (const text of ["2026-10-08T12:30:00", "2026-10-08T23:00:00", "2026-10-11T10:00:00"]) {
    const start = at(text);
    near(incomeBetween(config, start, start + 60000), monthMetrics(config, start).perSecond * 60);
  }
});
test("校验不完整、越界、反向午休与无有效工时", () => {
  assert.ok(validateConfig({ ...config, lunchEnd: "" }).errors.lunchEnd);
  assert.ok(validateConfig({ ...config, lunchStart: "08:00" }).errors.lunchStart);
  assert.ok(validateConfig({ ...config, lunchEnd: "19:00" }).errors.lunchEnd);
  assert.ok(validateConfig({ ...config, lunchEnd: "11:00" }).errors.lunchEnd);
  assert.ok(validateConfig({ ...config, lunchStart: "09:00", lunchEnd: "18:00" }).errors.lunchEnd);
  assert.ok(validateConfig({ ...config, workEnd: "08:00" }).errors.workEnd);
  assert.ok(validateConfig({ ...config, salary: -1 }).errors.salary);
  assert.ok(validateConfig({ ...config, salary: 0.001 }).errors.salary);
  assert.equal(validateConfig(config).config.salary, 10000);
});
