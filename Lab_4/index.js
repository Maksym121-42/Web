const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());

const ALLOWED_POSITIONS = ["open", "closed"];
const ALLOWED_MECHANISMS = ["spring", "hydraulic", "motor"];

let eventSeq = 1;

let circuitBreakers = [
  {
    id: 1,
    name: "QF-110-1",
    voltage: 110,
    current: 1600,
    position: "open",
    switchingCount: 2,
    lastSwitching: "2026-04-24T12:10:00.000Z",
    mechanism: "spring",
    operationTime: 45,
    switchHistory: [
      { eventId: eventSeq++, from: "closed", to: "open", switchedAt: "2026-04-24T12:10:00.000Z" },
      { eventId: eventSeq++, from: "open", to: "closed", switchedAt: "2026-04-23T08:30:00.000Z" }
    ]
  },
  {
    id: 2,
    name: "QF-330-2",
    voltage: 330,
    current: 2500,
    position: "closed",
    switchingCount: 1,
    lastSwitching: "2026-04-20T09:00:00.000Z",
    mechanism: "hydraulic",
    operationTime: 38,
    switchHistory: [
      { eventId: eventSeq++, from: "open", to: "closed", switchedAt: "2026-04-20T09:00:00.000Z" }
    ]
  },
  {
    id: 3,
    name: "QF-750-3",
    voltage: 750,
    current: 4000,
    position: "open",
    switchingCount: 0,
    lastSwitching: "2026-04-25T00:00:00.000Z",
    mechanism: "motor",
    operationTime: 52,
    switchHistory: []
  }
];

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function findBreaker(id) {
  return circuitBreakers.find((b) => b.id === id);
}

function toPublicBreaker(breaker) {
  const { switchHistory, ...rest } = breaker;
  return rest;
}

function validateUpdate(body) {
  const errors = [];
  const allowed = ["name", "voltage", "current", "mechanism", "operationTime"];
  const keys = Object.keys(body);

  if (keys.length === 0) {
    errors.push("Request body is empty.");
    return errors;
  }

  for (const key of keys) {
    if (!allowed.includes(key)) {
      errors.push(`Field '${key}' is not allowed for update.`);
    }
  }

  if ("name" in body && (typeof body.name !== "string" || body.name.trim() === "")) {
    errors.push("name must be a non-empty string.");
  }

  if ("voltage" in body && (typeof body.voltage !== "number" || body.voltage <= 0)) {
    errors.push("voltage must be a number > 0.");
  }

  if ("current" in body && (typeof body.current !== "number" || body.current <= 0)) {
    errors.push("current must be a number > 0.");
  }

  if (
    "mechanism" in body &&
    (typeof body.mechanism !== "string" || !ALLOWED_MECHANISMS.includes(body.mechanism))
  ) {
    errors.push("mechanism must be one of: spring, hydraulic, motor.");
  }

  if (
    "operationTime" in body &&
    (typeof body.operationTime !== "number" || body.operationTime <= 0)
  ) {
    errors.push("operationTime must be a number > 0.");
  }

  return errors;
}

// Site page (same folder, no subfolders)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---------------- API ----------------

// GET /api/circuit-breakers
app.get("/api/circuit-breakers", (req, res) => {
  res.json(circuitBreakers.map(toPublicBreaker));
});

// GET /api/circuit-breakers/:id
app.get("/api/circuit-breakers/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id." });

  const breaker = findBreaker(id);
  if (!breaker) return res.status(404).json({ error: "Circuit breaker not found." });

  res.json(toPublicBreaker(breaker));
});

// POST /api/circuit-breakers/:id/switch
app.post("/api/circuit-breakers/:id/switch", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id." });

  const breaker = findBreaker(id);
  if (!breaker) return res.status(404).json({ error: "Circuit breaker not found." });

  const body = req.body || {};
  const bodyKeys = Object.keys(body);
  if (bodyKeys.some((k) => k !== "position")) {
    return res.status(400).json({ error: "Only 'position' field is allowed." });
  }

  let targetPosition = body.position;
  if (targetPosition === undefined) {
    targetPosition = breaker.position === "open" ? "closed" : "open";
  }

  if (!ALLOWED_POSITIONS.includes(targetPosition)) {
    return res.status(400).json({ error: "position must be 'open' or 'closed'." });
  }

  if (targetPosition === breaker.position) {
    return res.status(400).json({ error: "Breaker already in that position." });
  }

  const now = new Date().toISOString();
  const event = {
    eventId: eventSeq++,
    from: breaker.position,
    to: targetPosition,
    switchedAt: now
  };

  breaker.position = targetPosition;
  breaker.switchingCount += 1;
  breaker.lastSwitching = now;
  breaker.switchHistory.push(event);

  res.json({
    message: "Switch operation completed.",
    breaker: toPublicBreaker(breaker),
    event
  });
});

// GET /api/circuit-breakers/:id/history
app.get("/api/circuit-breakers/:id/history", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id." });

  const breaker = findBreaker(id);
  if (!breaker) return res.status(404).json({ error: "Circuit breaker not found." });

  res.json({
    id: breaker.id,
    name: breaker.name,
    history: breaker.switchHistory
  });
});

// PUT /api/circuit-breakers/:id
app.put("/api/circuit-breakers/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id." });

  const breaker = findBreaker(id);
  if (!breaker) return res.status(404).json({ error: "Circuit breaker not found." });

  const errors = validateUpdate(req.body || {});
  if (errors.length > 0) return res.status(400).json({ errors });

  if ("name" in req.body) breaker.name = req.body.name.trim();
  if ("voltage" in req.body) breaker.voltage = req.body.voltage;
  if ("current" in req.body) breaker.current = req.body.current;
  if ("mechanism" in req.body) breaker.mechanism = req.body.mechanism;
  if ("operationTime" in req.body) breaker.operationTime = req.body.operationTime;

  res.json({
    message: "Breaker updated.",
    breaker: toPublicBreaker(breaker)
  });
});

// DELETE /api/circuit-breakers/:id
app.delete("/api/circuit-breakers/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id." });

  const index = circuitBreakers.findIndex((b) => b.id === id);
  if (index === -1) return res.status(404).json({ error: "Circuit breaker not found." });

  const [deleted] = circuitBreakers.splice(index, 1);
  res.json({
    message: "Breaker deleted.",
    breaker: toPublicBreaker(deleted)
  });
});

// API 404
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// General 404 (site)
app.use((req, res) => {
  res.status(404).send("Page not found.");
});

// Error handler (including invalid JSON)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
