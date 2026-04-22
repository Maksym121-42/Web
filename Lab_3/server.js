const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function readRecords() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf8");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

app.get("/records", async (req, res) => {
  const records = await readRecords();
  res.json(records);
});

app.post("/submit", async (req, res) => {
  const records = await readRecords();

  const record = {
    number: String(req.body.number || "").trim(),
    customer: String(req.body.customer || "").trim(),
    object: String(req.body.object || "").trim(),
    cost: Number(req.body.cost),
    economy: Number(req.body.economy),
    terms: String(req.body.terms || "").trim(),
    createdAt: new Date().toISOString()
  };

  records.push(record);
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf8");

  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
