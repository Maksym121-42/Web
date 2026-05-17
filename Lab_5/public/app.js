const POLL_MS = 3000;
const MAX_ROWS = 12;

const NORMS = {
  voltageDeviation: { min: -10, max: 10 },
  unbalance: { max: 2 },
  thd: { max: 8 },
  flicker: { max: 1.0 },
  frequency: { min: 49.8, max: 50.2 }
};

let tableRows = [];
let lastTimestamp = null;

const statusEl = document.getElementById("status");
const historyBody = document.getElementById("historyBody");

const valVoltage = document.getElementById("valVoltage");
const valUnbalance = document.getElementById("valUnbalance");
const valThd = document.getElementById("valThd");
const valFlicker = document.getElementById("valFlicker");
const valFreq = document.getElementById("valFreq");

const nVoltage = document.getElementById("nVoltage");
const nUnbalance = document.getElementById("nUnbalance");
const nThd = document.getElementById("nThd");
const nFlicker = document.getElementById("nFlicker");
const nFreq = document.getElementById("nFreq");

const waveChart = new Chart(document.getElementById("waveChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "U(t), В",
      data: [],
      borderColor: "#1f77b4",
      backgroundColor: "rgba(31, 119, 180, 0.15)",
      tension: 0.15,
      pointRadius: 0
    }]
  },
  options: {
    responsive: true,
    animation: false
  }
});

const harmChart = new Chart(document.getElementById("harmChart"), {
  type: "bar",
  data: {
    labels: [],
    datasets: [{
      label: "Амплітуда, %",
      data: [],
      backgroundColor: "#ff9f40"
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: true } }
  }
});

function setStatus(ok, text) {
  statusEl.textContent = text;
  statusEl.className = ok ? "status ok" : "status err";
}

function inNorm(key, value) {
  const rule = NORMS[key];
  if (rule.min !== undefined && value < rule.min) return false;
  if (rule.max !== undefined && value > rule.max) return false;
  return true;
}

function setNormCell(el, label, ok) {
  el.textContent = `${label}: ${ok ? "Норма" : "Порушення"}`;
  el.className = ok ? "norm-item norm-ok" : "norm-item norm-bad";
}

function updateMainValues(item) {
  valVoltage.textContent = `${item.voltageDeviation.toFixed(2)} %`;
  valUnbalance.textContent = `${item.unbalance.toFixed(2)}`;
  valThd.textContent = `${item.thd.toFixed(2)} %`;
  valFlicker.textContent = `${item.flicker.toFixed(2)}`;
  valFreq.textContent = `${item.frequency.toFixed(2)} Гц`;
}

function updateNorms(item) {
  setNormCell(nVoltage, "Відхилення напруги", inNorm("voltageDeviation", item.voltageDeviation));
  setNormCell(nUnbalance, "Несиметрія", inNorm("unbalance", item.unbalance));
  setNormCell(nThd, "THD", inNorm("thd", item.thd));
  setNormCell(nFlicker, "Фліккер", inNorm("flicker", item.flicker));
  setNormCell(nFreq, "Частота", inNorm("frequency", item.frequency));
}

function updateCharts(item) {
  waveChart.data.labels = item.waveform.map((_, i) => i + 1);
  waveChart.data.datasets[0].data = item.waveform;
  waveChart.update();

  harmChart.data.labels = item.harmonics.map((h) => `${h.order} гар.`);
  harmChart.data.datasets[0].data = item.harmonics.map((h) => h.amplitude);
  harmChart.update();
}

function rowStatus(item) {
  const ok =
    inNorm("voltageDeviation", item.voltageDeviation) &&
    inNorm("unbalance", item.unbalance) &&
    inNorm("thd", item.thd) &&
    inNorm("flicker", item.flicker) &&
    inNorm("frequency", item.frequency);

  return ok ? "Норма" : "Порушення";
}

function addTableRow(item) {
  tableRows.unshift(item);
  if (tableRows.length > MAX_ROWS) tableRows.pop();

  historyBody.innerHTML = tableRows.map((r) => `
    <tr>
      <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
      <td>${r.voltageDeviation.toFixed(2)}</td>
      <td>${r.unbalance.toFixed(2)}</td>
      <td>${r.thd.toFixed(2)}</td>
      <td>${r.flicker.toFixed(2)}</td>
      <td>${r.frequency.toFixed(2)}</td>
      <td>${rowStatus(r)}</td>
    </tr>
  `).join("");
}

function updateAll(item) {
  updateMainValues(item);
  updateNorms(item);
  updateCharts(item);
  addTableRow(item);
}

async function loadHistory() {
  const res = await fetch("/api/power-quality/history");
  if (!res.ok) throw new Error("history error");
  const data = await res.json();

  tableRows = [];
  data.slice().reverse().forEach(addTableRow);

  if (data.length > 0) {
    const last = data[data.length - 1];
    lastTimestamp = last.timestamp;
    updateMainValues(last);
    updateNorms(last);
    updateCharts(last);
  }
}

async function loadLatest() {
  const res = await fetch("/api/power-quality/latest");
  if (!res.ok) throw new Error("latest error");
  const item = await res.json();

  if (item.timestamp === lastTimestamp) return;
  lastTimestamp = item.timestamp;
  updateAll(item);
}

async function start() {
  try {
    await loadHistory();
    setStatus(true, "Онлайн");
  } catch {
    setStatus(false, "Помилка підключення");
  }

  setInterval(async () => {
    try {
      await loadLatest();
      setStatus(true, "Онлайн");
    } catch {
      setStatus(false, "Помилка API");
    }
  }, POLL_MS);
}

start();