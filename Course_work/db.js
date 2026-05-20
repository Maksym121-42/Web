const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "notes.db");
const schemaPath = path.join(__dirname, "data_base.sql");

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const hasUsersTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='USERS'")
  .get();

if (!hasUsersTable && fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);
}

module.exports = db;
