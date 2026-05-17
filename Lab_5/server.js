const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function step(prev, delta, min, max) {
  return clamp(prev + (Math.random() * 2 - 1) * delta, min, max);
}

function generateHarmonics(thd) {
  // Простий навчальний розподіл THD по гармоніках
  const h3 = +(thd * 0.45).toFixed(2);
  const h5 = +(thd * 0.30).toFixed(2);
  const h7 = +(thd * 0.15).toFixed(2);
  const h9 = +(thd * 0.10).toFixed(2);

  return [
    { order: 1, amplitude: 100.0 }, // основна
    { order: 3, amplitude: h3 },
    { order: 5, amplitude: h5 },
    { order: 7, amplitude: h7 },
    { order: 9, amplitude: h9 }
  ];
}

function generateWaveform(thd) {
  const samples = 80;
  const result = [];

  for (let i = 0; i < samples; i += 1) {
    const a = (2 * Math.PI * i) / samples;
    const fundamental = 230 * Math.sin(a);
    const h3 = (230 * (thd / 100) * 0.5) * Math.sin(3 * a);
    const h5 = (230 * (thd / 100) * 0.3) * Math.sin(5 * a);
    const h7 = (230 * (thd / 100) * 0.2) * Math.sin(7 * a);
    result.push(+(fundamental + h3 + h5 + h7).toFixed(2));
  }

  return result;
}

let latest = {
  timestamp: new Date().toISOString(),
  voltageDeviation: 2.5, // %
  unbalance: 1.2,        // коефіцієнт несиметрії
  thd: 4.8,              // %
  flicker: 0.6,          // Pst
  frequency: 50.0        // Гц
};

latest.harmonics = generateHarmonics(latest.thd);
latest.waveform = generateWaveform(latest.thd);

const history = [latest];

function updateData() {
  latest = {
    timestamp: new Date().toISOString(),
    voltageDeviation: +step(latest.voltageDeviation, 1.2, -12, 12).toFixed(2),
    unbalance: +step(latest.unbalance, 0.25, 0, 4).toFixed(2),
    thd: +step(latest.thd, 0.6, 1, 12).toFixed(2),
    flicker: +step(latest.flicker, 0.12, 0.1, 2).toFixed(2),
    frequency: +step(latest.frequency, 0.06, 49.6, 50.4).toFixed(2)
  };

  latest.harmonics = generateHarmonics(latest.thd);
  latest.waveform = generateWaveform(latest.thd);

  history.push(latest);
  if (history.length > 200) history.shift();
}

setInterval(updateData, 2000);

app.get("/api/power-quality/latest", (req, res) => {
  res.json(latest);
});

app.get("/api/power-quality/history", (req, res) => {
  res.json(history.slice(-20));
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});