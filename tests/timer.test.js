import test from "node:test";
import assert from "node:assert/strict";
import { IncomeTimer } from "../src/timer.js";
import { monthMetrics } from "../src/calculations.js";

const config = { salary: 22000, workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00", singleRest: false };
function setup() {
  let wall = Date.parse("2026-10-11T23:00:00+08:00"), mono = 0;
  const clock = { wall: () => wall, mono: () => mono };
  return { timer: new IncomeTimer(config, null, clock), clock, advance(ms) { wall += ms; mono += ms; }, shiftWall(ms) { wall += ms; } };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8);
test("从零开始，暂停不计时，继续保留累计", () => {
  const { timer, advance } = setup();
  assert.deepEqual(timer.value(), { elapsedMs: 0, amount: 0 });
  timer.start(); advance(10000); timer.pause();
  assert.equal(timer.value().elapsedMs, 10000);
  const amount = timer.value().amount;
  advance(60000);
  assert.equal(timer.value().amount, amount);
  timer.start(); advance(5000); timer.pause();
  assert.equal(timer.value().elapsedMs, 15000);
  near(timer.value().amount, amount * 1.5);
});
test("后台长间隔不依赖更新次数", () => {
  const { timer, advance, clock } = setup();
  timer.start(); advance(3600000);
  assert.equal(timer.value().elapsedMs, 3600000);
  near(timer.value().amount, 3600 * monthMetrics(config, clock.wall()).perSecond);
});
test("修改薪资只改变后续计时收入", () => {
  const { timer, advance } = setup();
  timer.start(); advance(10000);
  const first = timer.value().amount;
  timer.setConfig({ ...config, salary: config.salary * 2 });
  assert.equal(timer.running, true);
  near(timer.value().amount, first);
  advance(10000); timer.pause();
  near(timer.value().amount, first * 3);
  assert.equal(timer.value().elapsedMs, 20000);
});
test("刷新恢复结果并暂停", () => {
  const { timer, advance, clock } = setup();
  timer.start(); advance(4321); timer.pause();
  const snapshot = timer.snapshot();
  advance(60000);
  const restored = new IncomeTimer(config, snapshot, clock);
  assert.equal(restored.running, false);
  assert.deepEqual(restored.value(), timer.value());
});
test("意外关闭恢复未保存区间并暂停", () => {
  const { timer, advance, clock } = setup();
  timer.start(); advance(1000);
  const snapshot = timer.snapshot(); advance(2000);
  const restored = new IncomeTimer(config, snapshot, clock);
  assert.equal(restored.running, false);
  assert.equal(restored.value().elapsedMs, 3000);
  near(restored.value().amount, timer.value().amount);
});
test("系统时间变化不改变当前运行段的经过时间", () => {
  const { timer, advance, shiftWall } = setup();
  timer.start(); advance(2000);
  const amount = timer.value().amount;
  shiftWall(-3600000);
  assert.equal(timer.value().elapsedMs, 2000);
  assert.equal(timer.value().amount, amount);
});
test("运行中归零同时停止时间与收入", () => {
  const { timer, advance } = setup();
  timer.start(); advance(9000); timer.reset(); advance(9000);
  assert.equal(timer.running, false);
  assert.deepEqual(timer.value(), { elapsedMs: 0, amount: 0 });
});
test("忽略无效保存数据", () => {
  const { clock } = setup();
  const timer = new IncomeTimer(config, { version: 1, elapsedMs: -1, amount: NaN }, clock);
  assert.deepEqual(timer.value(), { elapsedMs: 0, amount: 0 });
});
