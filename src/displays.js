const SEGMENTS = {
  0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
  5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

function makeHalf(position, flap = false) {
  const face = document.createElement("span");
  face.className = `digit-face ${position}${flap ? " flap" : ""}`;
  const glyph = document.createElement("span");
  glyph.className = "glyph";
  face.append(glyph);
  return face;
}

export class FlipDisplay {
  constructor(element) {
    this.element = element;
    this.cells = [];
    this.integerDigits = 0;
    this.lastText = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  build(integerDigits) {
    this.element.replaceChildren();
    this.integerDigits = integerDigits;
    this.cells = [];
    this.element.style.setProperty("--digit-font", `${Math.min(19, 92 / (integerDigits + 2))}cqw`);
    for (let index = 0; index < integerDigits + 2; index++) {
      if (index === integerDigits) {
        const dot = document.createElement("span");
        dot.className = "decimal";
        this.element.append(dot);
      }
      const cell = document.createElement("span");
      cell.className = "digit";
      cell.setAttribute("aria-hidden", "true");
      const top = makeHalf("top"), bottom = makeHalf("bottom"), oldTop = makeHalf("top", true), newBottom = makeHalf("bottom", true);
      cell.append(top, bottom, oldTop, newBottom);
      this.element.append(cell);
      this.cells.push({ cell, top, bottom, oldTop, newBottom, value: "", generation: 0 });
    }
  }
  update(amount, minimumDigits = 3) {
    const blank = amount === null;
    const fixed = blank ? "" : Math.max(0, amount).toFixed(2);
    const integerDigits = Math.max(minimumDigits, blank ? 0 : fixed.split(".")[0].length);
    const rebuilt = this.integerDigits !== integerDigits;
    if (rebuilt) this.build(integerDigits);
    const digits = blank ? " ".repeat(integerDigits + 2) : fixed.replace(".", "").padStart(integerDigits + 2, "0");
    this.element.classList.toggle("is-blank", blank);
    this.element.setAttribute("aria-label", blank ? "金额面板空白" : `已赚 ${fixed} 元`);
    if (this.lastText === digits && !rebuilt) return;
    this.lastText = digits;
    for (let index = 0; index < this.cells.length; index++) {
      const state = this.cells[index], next = digits[index];
      if (state.value === next) continue;
      const previous = state.value;
      state.generation++;
      const generation = state.generation;
      for (const part of [state.oldTop, state.newBottom]) {
        part.getAnimations().forEach(animation => animation.cancel());
        part.style.visibility = "hidden";
      }
      state.top.firstChild.textContent = next;
      state.bottom.firstChild.textContent = next;
      state.value = next;
      if (blank || rebuilt || previous.trim() === "" || this.reducedMotion.matches) continue;
      state.oldTop.firstChild.textContent = previous;
      state.newBottom.firstChild.textContent = next;
      state.oldTop.style.visibility = "visible";
      state.newBottom.style.visibility = "visible";
      const upper = state.oldTop.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], { duration: 50, fill: "forwards", easing: "ease-in" });
      const lower = state.newBottom.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: 55, delay: 50, fill: "both", easing: "ease-out" });
      Promise.all([upper.finished, lower.finished]).then(() => {
        if (generation !== state.generation) return;
        state.oldTop.style.visibility = "hidden";
        state.newBottom.style.visibility = "hidden";
        upper.cancel(); lower.cancel();
      }).catch(() => {}); // A newer digit cancels the old animation instead of queueing it.
    }
  }
}

export class SevenSegmentDisplay {
  constructor(element) { this.element = element; this.lastText = ""; this.cells = []; }
  update(elapsedMs) {
    const seconds = Math.floor(elapsedMs / 1000);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const text = `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    if (text === this.lastText) return;
    if (text.length !== this.lastText.length) {
      this.element.replaceChildren();
      this.cells = [];
      for (const character of text) {
        const cell = document.createElement("span");
        if (character === ":") cell.className = "seven-colon";
        else {
          cell.className = "seven-digit";
          for (const letter of "abcdefg") {
            const segment = document.createElement("i");
            segment.className = `segment ${letter}`;
            cell.append(segment);
          }
        }
        cell.setAttribute("aria-hidden", "true");
        this.element.append(cell);
        this.cells.push(cell);
      }
    }
    for (let index = 0; index < text.length; index++) {
      if (text[index] === ":") continue;
      for (const segment of this.cells[index].children) segment.classList.toggle("on", SEGMENTS[text[index]].includes(segment.classList[1]));
    }
    this.lastText = text;
    this.element.setAttribute("aria-label", `已经过 ${Number(hours)} 小时 ${Math.floor(seconds / 60) % 60} 分 ${seconds % 60} 秒`);
  }
}
