import { incomeBetween, validateConfig } from "./calculations.js";

export class IncomeTimer {
  constructor(config, saved = null, clock = { wall: () => Date.now(), mono: () => performance.now() }) {
    this.clock = clock;
    this.config = config;
    this.elapsedMs = 0;
    this.amount = 0;
    this.running = false;
    if (saved && saved.version === 1 && Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 && Number.isFinite(saved.amount) && saved.amount >= 0) {
      this.elapsedMs = saved.elapsedMs;
      this.amount = saved.amount;
      // Recover the final unsaved interval after an unexpected tab closure, then stay paused.
      const previousConfig = saved.config && validateConfig(saved.config).config;
      if (saved.running && previousConfig && Number.isFinite(saved.savedAt) && saved.savedAt > 0 && saved.savedAt < clock.wall()) {
        this.elapsedMs += clock.wall() - saved.savedAt;
        this.amount += incomeBetween(previousConfig, saved.savedAt, clock.wall());
      }
    }
  }
  value() {
    if (!this.running) return { elapsedMs: this.elapsedMs, amount: this.amount };
    const delta = Math.max(0, this.clock.mono() - this.anchorMono);
    return { elapsedMs: this.elapsedMs + delta, amount: this.amount + incomeBetween(this.config, this.anchorWall, this.anchorWall + delta) };
  }
  start() {
    if (this.running || !this.config) return;
    this.anchorWall = this.clock.wall();
    this.anchorMono = this.clock.mono();
    this.running = true;
  }
  pause() {
    if (!this.running) return;
    const value = this.value();
    this.elapsedMs = value.elapsedMs;
    this.amount = value.amount;
    this.running = false;
  }
  reset() { this.running = false; this.elapsedMs = 0; this.amount = 0; }
  setConfig(config) {
    const resume = this.running;
    this.pause();
    this.config = config;
    if (resume) this.start();
  }
  snapshot() {
    return { version: 1, ...this.value(), running: this.running, savedAt: this.clock.wall(), config: this.config };
  }
}
