import { chinaDate, validateConfig, monthMetrics, dailyIncome } from "./calculations.js";
import { IncomeTimer } from "./timer.js";
import { FlipDisplay, SevenSegmentDisplay } from "./displays.js";

const $ = id => document.getElementById(id);
const SETTINGS_KEY = "salary-per-second.settings.v1";
const TIMER_KEY = "salary-per-second.timer.v1";
let storageAvailable = true;
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { storageAvailable = false; return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { storageAvailable = false; }
}
const stored = load(SETTINGS_KEY);
let config = stored?.version === 1 ? validateConfig(stored.config ?? {}).config : null;
const timerRecord = load(TIMER_KEY);
const timer = new IncomeTimer(config, config ? timerRecord : null);
let mode = config && timerRecord?.mode === "timer" ? "timer" : "daily";
const display = new FlipDisplay($("amount-display"));
const elapsed = new SevenSegmentDisplay($("elapsed-display"));
const dialog = $("settings-dialog");
const form = $("settings-form");
let lastPersist = 0;
let lastRender = 0;

function persistTimer() { save(TIMER_KEY, { ...timer.snapshot(), mode }); }
function render() {
  const manual = mode === "timer";
  const metrics = config ? monthMetrics(config) : null;
  $("setup-guide").hidden = !!config;
  $("status-text").hidden = !config || manual;
  $("elapsed-display").hidden = !config || !manual;
  $("daily-mode").setAttribute("aria-pressed", String(!manual));
  $("timer-mode").setAttribute("aria-pressed", String(manual));
  $("daily-mode").parentElement.classList.toggle("timer-selected", manual);
  $("toggle-timer").disabled = !config || !manual;
  $("reset-timer").disabled = !config || !manual || (!timer.running && timer.elapsedMs === 0);
  const toggleLabel = timer.running ? "暂停计时" : timer.elapsedMs > 0 ? "继续计时" : "开始计时";
  $("toggle-timer").setAttribute("aria-label", toggleLabel);
  $("toggle-timer").title = toggleLabel;
  $("timer-icon").setAttribute("href", timer.running ? "#icon-pause" : "#icon-play");
  $("screen-indicator").classList.remove("active");
  if (!config) {
    display.update(null);
    $("status-text").textContent = "";
  } else if (manual) {
    const value = timer.value();
    display.update(value.amount, metrics.integerDigits);
    elapsed.update(value.elapsedMs);
    $("screen-indicator").classList.toggle("active", timer.running);
  } else {
    const income = dailyIncome(config);
    display.update(income.status === "rest" ? null : income.amount, metrics.integerDigits);
    $("status-text").textContent = { working: "工作中...", lunch: "午休中", rest: "休息中..." }[income.status];
    $("screen-indicator").classList.toggle("active", income.status === "working");
  }
}
function switchMode(next) {
  if (next === "timer" && !config) { openSettings(); return; }
  if (next === "daily") timer.pause();
  mode = next;
  persistTimer();
  render();
}
$("daily-mode").addEventListener("click", () => switchMode("daily"));
$("timer-mode").addEventListener("click", () => switchMode("timer"));
$("toggle-timer").addEventListener("click", () => {
  if (timer.running) timer.pause(); else timer.start();
  persistTimer(); render();
});
$("reset-timer").addEventListener("click", () => { timer.reset(); persistTimer(); render(); });

function readForm() {
  return {
    salary: form.elements.salary.value,
    workStart: form.elements.workStart.value, workEnd: form.elements.workEnd.value,
    lunchStart: form.elements.lunchStart.value, lunchEnd: form.elements.lunchEnd.value,
    singleRest: form.elements.singleRest.checked,
  };
}
function clearErrors() {
  for (const field of ["salary", "workStart", "workEnd", "lunchStart", "lunchEnd"]) {
    $(`${field}-error`).textContent = "";
    form.elements[field].removeAttribute("aria-invalid");
  }
}
function preview() {
  const draft = validateConfig(readForm()).config;
  const date = chinaDate();
  $("month-label").textContent = `${date.year} 年 ${date.month + 1} 月`;
  for (const id of ["preview-days", "preview-hours", "preview-daily", "preview-hourly", "preview-rate"]) $(id).textContent = "—";
  if (draft) {
    const metrics = monthMetrics(draft);
    $("preview-days").textContent = `${metrics.days} 天`;
    $("preview-hours").textContent = `${Number((metrics.seconds / 3600).toFixed(2))} 小时`;
    $("preview-daily").textContent = `¥ ${metrics.dailySalary.toFixed(2)}`;
    $("preview-hourly").textContent = `¥ ${(metrics.perSecond * 3600).toFixed(2)}`;
    $("preview-rate").textContent = metrics.perSecond >= 0.000001 ? metrics.perSecond.toFixed(6) : metrics.perSecond.toPrecision(4);
  }
  $("storage-note").textContent = storageAvailable ? "设置仅保存在此浏览器" : "浏览器存储不可用，本次设置仅在当前页面有效";
}
function openSettings() {
  clearErrors();
  const values = config ?? { salary: "", workStart: "", workEnd: "", lunchStart: "", lunchEnd: "", singleRest: false };
  for (const field of ["salary", "workStart", "workEnd", "lunchStart", "lunchEnd"]) form.elements[field].value = values[field];
  form.elements.singleRest.checked = values.singleRest;
  preview();
  dialog.showModal();
}
$("settings-button").addEventListener("click", openSettings);
$("close-settings").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});
form.addEventListener("input", () => { clearErrors(); preview(); });
$("clear-lunch").addEventListener("click", () => {
  form.elements.lunchStart.value = ""; form.elements.lunchEnd.value = "";
  clearErrors(); preview();
});
form.addEventListener("submit", event => {
  event.preventDefault(); clearErrors();
  const result = validateConfig(readForm());
  if (!result.config) {
    for (const [field, message] of Object.entries(result.errors)) {
      $(`${field}-error`).textContent = message;
      form.elements[field].setAttribute("aria-invalid", "true");
    }
    form.elements[Object.keys(result.errors)[0]].focus();
    return;
  }
  timer.setConfig(result.config);
  config = result.config;
  save(SETTINGS_KEY, { version: 1, config });
  persistTimer(); render(); dialog.close();
});

window.addEventListener("pagehide", () => { timer.pause(); persistTimer(); });
document.addEventListener("visibilitychange", () => { persistTimer(); render(); });
window.addEventListener("pageshow", render);
function frame(timestamp) {
  if (timestamp - lastRender >= 90) { render(); lastRender = timestamp; }
  if (timer.running && timestamp - lastPersist >= 1000) { persistTimer(); lastPersist = timestamp; }
  requestAnimationFrame(frame);
}
persistTimer();
render();
requestAnimationFrame(frame);
