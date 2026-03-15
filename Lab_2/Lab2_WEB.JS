const PARAMS = [
  { key: "q", name: "Реактивна потужність мережі", unit: "кВАр", min: -500, max: 500, nMin: -100, nMax: 100, dec: 0 },
  { key: "pf", name: "Коефіцієнт потужності", unit: "", min: 0.6, max: 1.0, nMin: 0.92, nMax: 0.98, dec: 3 },
  { key: "u", name: "Напруга мережі", unit: "В", min: 350, max: 420, nMin: 380, nMax: 400, dec: 0 },
  { key: "steps", name: "Кількість увімкнених ступенів", unit: "", min: 0, max: 12, nMin: 2, nMax: 8, dec: 0 },
  { key: "temp", name: "Температура конденсаторів", unit: "°C", min: 20, max: 90, nMin: 25, nMax: 65, dec: 1 },
  { key: "saving", name: "Економія електроенергії", unit: "%", min: 0, max: 30, nMin: 8, nMax: 25, dec: 1 }
];

const cardsEl = document.getElementById("cards");
const lastUpdateEl = document.getElementById("lastUpdate");
const manualBtn = document.getElementById("manualBtn");
const toggleAutoBtn = document.getElementById("toggleAutoBtn");
const intervalInput = document.getElementById("intervalInput");
const applyIntervalBtn = document.getElementById("applyIntervalBtn");

let timer = null;
let autoOn = true;
let intervalMs = 3000;

function random(min, max, dec = 0) {
  const n = Math.random() * (max - min) + min;
  return Number(n.toFixed(dec));
}

function getStatus(value, p) {
  if (value < p.min || value > p.max) return "alarm";
  if (value < p.nMin || value > p.nMax) return "warn";
  return "ok";
}

function statusLabel(status) {
  if (status === "ok") return "Норма";
  if (status === "warn") return "Попередження";
  return "Аварія";
}

function simulateData() {
  const q = random(-500, 500, 0);
  const pf = random(0.6, 1.0, 3);
  const u = random(350, 420, 0);
  const steps = Math.round(random(0, 12, 0));
  const temp = random(22, 88, 1);

  let saving = (pf - 0.8) * 40 + steps * 0.8 - Math.abs(q) / 120;
  saving = Math.max(0, Math.min(30, Number(saving.toFixed(1))));

  let contactor = "Справний";
  if (temp > 75 || Math.random() < 0.07) contactor = "Попередження";
  if (temp > 85 || Math.random() < 0.02) contactor = "Аварія";

  return { q, pf, u, steps, temp, saving, contactor };
}

function render() {
  const data = simulateData();

  const values = {
    q: data.q,
    pf: data.pf,
    u: data.u,
    steps: data.steps,
    temp: data.temp,
    saving: data.saving
  };

  const html = PARAMS.map((p) => {
    const value = values[p.key];
    const status = getStatus(value, p);

    return `
      <article class="card ${status}">
        <div class="name">${p.name}</div>
        <div class="value">${value}${p.unit ? " " + p.unit : ""}</div>
        <div class="meta">Діапазон: ${p.min}..${p.max} ${p.unit}</div>
        <div class="meta">Норма: ${p.nMin}..${p.nMax} ${p.unit}</div>
        <span class="badge ${status}">${statusLabel(status)}</span>
      </article>
    `;
  }).join("");

  const contactorStatus =
    data.contactor === "Справний" ? "ok" :
    data.contactor === "Попередження" ? "warn" : "alarm";

  cardsEl.innerHTML = html + `
    <article class="card ${contactorStatus}">
      <div class="name">Стан контакторів</div>
      <div class="value">${data.contactor}</div>
      <div class="meta">Додаткова вимога</div>
      <span class="badge ${contactorStatus}">${data.contactor}</span>
    </article>
  `;

  lastUpdateEl.textContent = "Останнє оновлення: " + new Date().toLocaleTimeString("uk-UA");
}

function startAuto() {
  stopAuto();
  timer = setInterval(render, intervalMs);
  autoOn = true;
  toggleAutoBtn.textContent = "Пауза автооновлення";
}

function stopAuto() {
  if (timer) clearInterval(timer);
  timer = null;
  autoOn = false;
  toggleAutoBtn.textContent = "Запустити автооновлення";
}

manualBtn.addEventListener("click", render);

toggleAutoBtn.addEventListener("click", () => {
  if (autoOn) stopAuto();
  else startAuto();
});

applyIntervalBtn.addEventListener("click", () => {
  const sec = Number(intervalInput.value);
  if (!Number.isFinite(sec) || sec < 1 || sec > 30) {
    alert("Інтервал має бути в межах 1..30 секунд");
    return;
  }
  intervalMs = sec * 1000;
  if (autoOn) startAuto();
});

render();
startAuto();
