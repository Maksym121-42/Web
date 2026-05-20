const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const db = require("./db");
const { authRequired, adminRequired } = require("./middleware");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
process.env.JWT_SECRET = JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const roleLabel = {
  0: "user",
  1: "admin",
};

const permissionLabel = {
  1: "view",
  2: "edit",
};

function buildToken(user) {
  return jwt.sign(
    {
      id_user: user.id_user,
      role: user.role,
      email_user: user.email_user,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function mapPublicUser(user) {
  return {
    id_user: user.id_user,
    name_user: user.name_user,
    email_user: user.email_user,
    role: user.role,
    role_label: roleLabel[user.role] || "unknown",
    is_blocked: user.is_blocked,
    created_at: user.created_at,
  };
}

function getNoteById(idNote) {
  return db
    .prepare(
      `SELECT id_note, id_user, title_note, content_note, char_count, created_at, updated_at
       FROM NOTES WHERE id_note = ?`
    )
    .get(idNote);
}

function getShareRecord(idNote, idShareUser) {
  return db
    .prepare(
      `SELECT id_share_note, id_note, id_owner, id_share_user, permission
       FROM SHARE_NOTES
       WHERE id_note = ? AND id_share_user = ?`
    )
    .get(idNote, idShareUser);
}

function canViewNote(note, user) {
  if (!note || !user) return false;
  if (user.role === 1) return true;
  if (note.id_user === user.id_user) return true;
  return Boolean(getShareRecord(note.id_note, user.id_user));
}

function canEditNote(note, user) {
  if (!note || !user) return false;
  if (user.role === 1) return true;
  if (note.id_user === user.id_user) return true;
  const share = getShareRecord(note.id_note, user.id_user);
  return Boolean(share && share.permission === 2);
}

function canDeleteNote(note, user) {
  if (!note || !user) return false;
  if (user.role === 1) return true;
  return note.id_user === user.id_user;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

app.post("/api/auth/register", async (req, res) => {
  const { name_user, email_user, password_user } = req.body;
  const cleanName = String(name_user || "").trim();
  const cleanEmail = String(email_user || "")
    .trim()
    .toLowerCase();
  const cleanPassword = String(password_user || "");

  if (!cleanName || !cleanEmail || !cleanPassword) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  if (!cleanEmail.includes("@")) {
    return res.status(400).json({ message: "Email is not valid" });
  }
  if (cleanPassword.length < 6) {
    return res.status(400).json({ message: "Password must have at least 6 characters" });
  }

  const existing = db
    .prepare("SELECT id_user FROM USERS WHERE email_user = ?")
    .get(cleanEmail);
  if (existing) {
    return res.status(409).json({ message: "Email already registered" });
  }

  const hash = await bcrypt.hash(cleanPassword, 10);

  const insert = db
    .prepare(
      `INSERT INTO USERS (name_user, email_user, password_user, role, is_blocked)
       VALUES (?, ?, ?, 0, 0)`
    )
    .run(cleanName, cleanEmail, hash);

  const newUser = db
    .prepare(
      `SELECT id_user, name_user, email_user, role, is_blocked, created_at
       FROM USERS WHERE id_user = ?`
    )
    .get(insert.lastInsertRowid);

  const token = buildToken(newUser);

  return res.status(201).json({
    message: "Registration successful",
    token,
    user: mapPublicUser(newUser),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const cleanEmail = String(req.body.email_user || "")
    .trim()
    .toLowerCase();
  const cleanPassword = String(req.body.password_user || "");

  if (!cleanEmail || !cleanPassword) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = db
    .prepare(
      `SELECT id_user, name_user, email_user, password_user, role, is_blocked, created_at
       FROM USERS WHERE email_user = ?`
    )
    .get(cleanEmail);

  if (!user) {
    return res.status(401).json({ message: "Wrong email or password" });
  }
  if (user.is_blocked === 1) {
    return res.status(403).json({ message: "This account is blocked" });
  }

  const isMatch = await bcrypt.compare(cleanPassword, user.password_user);
  if (!isMatch) {
    return res.status(401).json({ message: "Wrong email or password" });
  }

  const token = buildToken(user);
  return res.json({
    message: "Login successful",
    token,
    user: mapPublicUser(user),
  });
});

app.post("/api/auth/logout", (_req, res) => {
  return res.json({ message: "Logout successful" });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  return res.json({ user: mapPublicUser(req.user) });
});

app.get("/api/users/search", authRequired, (req, res) => {
  const email = String(req.query.email || "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ message: "Valid email query is required" });
  }

  const user = db
    .prepare(
      `SELECT id_user, name_user, email_user, role, is_blocked, created_at
       FROM USERS
       WHERE email_user = ?`
    )
    .get(email);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ user: mapPublicUser(user) });
});

app.get("/api/notes/my", authRequired, (req, res) => {
  const notes = db
    .prepare(
      `SELECT id_note, id_user, title_note, content_note, char_count, created_at, updated_at
       FROM NOTES
       WHERE id_user = ?
       ORDER BY updated_at DESC`
    )
    .all(req.user.id_user);

  return res.json({ notes });
});

app.get("/api/notes/shared", authRequired, (req, res) => {
  const notes = db
    .prepare(
      `SELECT
          n.id_note, n.id_user, n.title_note, n.content_note, n.char_count, n.created_at, n.updated_at,
          s.permission, u.name_user AS owner_name
       FROM SHARE_NOTES s
       INNER JOIN NOTES n ON n.id_note = s.id_note
       INNER JOIN USERS u ON u.id_user = s.id_owner
       WHERE s.id_share_user = ?
       ORDER BY n.updated_at DESC`
    )
    .all(req.user.id_user)
    .map((item) => ({
      ...item,
      permission_label: permissionLabel[item.permission] || "unknown",
    }));

  return res.json({ notes });
});

app.get("/api/notes/:id", authRequired, (req, res) => {
  const idNote = Number(req.params.id);
  if (!Number.isInteger(idNote)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  const note = getNoteById(idNote);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }

  if (!canViewNote(note, req.user)) {
    return res.status(403).json({ message: "No access to this note" });
  }

  const share = getShareRecord(note.id_note, req.user.id_user);
  return res.json({
    note: {
      ...note,
      access_mode:
        req.user.role === 1 || req.user.id_user === note.id_user
          ? "owner_or_admin"
          : permissionLabel[share.permission] || "view",
    },
  });
});

app.post("/api/notes", authRequired, (req, res) => {
  const title = String(req.body.title_note || "").trim();
  const content = String(req.body.content_note || "");
  const charCount = content.length;

  if (!title) {
    return res.status(400).json({ message: "title_note is required" });
  }

  const insert = db
    .prepare(
      `INSERT INTO NOTES (id_user, title_note, content_note, char_count)
       VALUES (?, ?, ?, ?)`
    )
    .run(req.user.id_user, title, content, charCount);

  const note = getNoteById(insert.lastInsertRowid);
  return res.status(201).json({ message: "Note created", note });
});

app.put("/api/notes/:id", authRequired, (req, res) => {
  const idNote = Number(req.params.id);
  if (!Number.isInteger(idNote)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  const note = getNoteById(idNote);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }
  if (!canEditNote(note, req.user)) {
    return res.status(403).json({ message: "No edit access to this note" });
  }

  const title = String(req.body.title_note ?? note.title_note).trim();
  const content = String(req.body.content_note ?? note.content_note);
  if (!title) {
    return res.status(400).json({ message: "title_note cannot be empty" });
  }

  db.prepare(
    `UPDATE NOTES
     SET title_note = ?, content_note = ?, char_count = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id_note = ?`
  ).run(title, content, content.length, idNote);

  const updated = getNoteById(idNote);
  return res.json({ message: "Note updated", note: updated });
});

app.delete("/api/notes/:id", authRequired, (req, res) => {
  const idNote = Number(req.params.id);
  if (!Number.isInteger(idNote)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  const note = getNoteById(idNote);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }
  if (!canDeleteNote(note, req.user)) {
    return res.status(403).json({ message: "No delete access to this note" });
  }

  db.prepare("DELETE FROM NOTES WHERE id_note = ?").run(idNote);
  return res.json({ message: "Note deleted" });
});

app.post("/api/notes/:id/share", authRequired, (req, res) => {
  const idNote = Number(req.params.id);
  const idShareUser = Number(req.body.id_share_user);
  const permission = Number(req.body.permission);

  if (!Number.isInteger(idNote) || !Number.isInteger(idShareUser)) {
    return res.status(400).json({ message: "Invalid note or user id" });
  }
  if (![1, 2].includes(permission)) {
    return res.status(400).json({ message: "permission must be 1 (view) or 2 (edit)" });
  }

  const note = getNoteById(idNote);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }
  if (!(req.user.role === 1 || req.user.id_user === note.id_user)) {
    return res.status(403).json({ message: "Only owner/admin can share note" });
  }
  if (note.id_user === idShareUser) {
    return res.status(400).json({ message: "Owner already has access" });
  }

  const targetUser = db
    .prepare("SELECT id_user, is_blocked FROM USERS WHERE id_user = ?")
    .get(idShareUser);
  if (!targetUser) {
    return res.status(404).json({ message: "Target user not found" });
  }
  if (targetUser.is_blocked === 1) {
    return res.status(400).json({ message: "Target user is blocked" });
  }

  const existing = db
    .prepare("SELECT id_share_note FROM SHARE_NOTES WHERE id_note = ? AND id_share_user = ?")
    .get(idNote, idShareUser);

  if (existing) {
    db.prepare("UPDATE SHARE_NOTES SET permission = ? WHERE id_share_note = ?").run(
      permission,
      existing.id_share_note
    );
    return res.json({
      message: "Share permission updated",
      permission,
      permission_label: permissionLabel[permission],
    });
  }

  db.prepare(
    `INSERT INTO SHARE_NOTES (id_note, id_owner, id_share_user, permission)
     VALUES (?, ?, ?, ?)`
  ).run(idNote, note.id_user, idShareUser, permission);

  return res.status(201).json({
    message: "Note shared successfully",
    permission,
    permission_label: permissionLabel[permission],
  });
});

app.get("/api/notes/:id/shares", authRequired, (req, res) => {
  const idNote = Number(req.params.id);
  if (!Number.isInteger(idNote)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  const note = getNoteById(idNote);
  if (!note) {
    return res.status(404).json({ message: "Note not found" });
  }

  if (!(req.user.role === 1 || req.user.id_user === note.id_user)) {
    return res.status(403).json({ message: "Only owner/admin can view shares" });
  }

  const shares = db
    .prepare(
      `SELECT
          s.id_share_note,
          s.id_note,
          s.id_owner,
          s.id_share_user,
          s.permission,
          u.name_user,
          u.email_user
       FROM SHARE_NOTES s
       INNER JOIN USERS u ON u.id_user = s.id_share_user
       WHERE s.id_note = ?
       ORDER BY s.id_share_note DESC`
    )
    .all(idNote)
    .map((item) => ({
      ...item,
      permission_label: permissionLabel[item.permission] || "unknown",
    }));

  return res.json({ shares });
});

app.delete("/api/shares/:id_share_note", authRequired, (req, res) => {
  const idShareNote = Number(req.params.id_share_note);
  if (!Number.isInteger(idShareNote)) {
    return res.status(400).json({ message: "Invalid share id" });
  }

  const share = db
    .prepare(
      `SELECT id_share_note, id_note, id_owner, id_share_user, permission
       FROM SHARE_NOTES
       WHERE id_share_note = ?`
    )
    .get(idShareNote);

  if (!share) {
    return res.status(404).json({ message: "Share record not found" });
  }

  if (!(req.user.role === 1 || req.user.id_user === share.id_owner)) {
    return res.status(403).json({ message: "Only owner/admin can remove access" });
  }

  db.prepare("DELETE FROM SHARE_NOTES WHERE id_share_note = ?").run(idShareNote);
  return res.json({ message: "Access removed successfully" });
});

app.get("/api/profile", authRequired, (req, res) => {
  const myNotesCount = db
    .prepare("SELECT COUNT(*) AS count FROM NOTES WHERE id_user = ?")
    .get(req.user.id_user).count;

  const sharedCount = db
    .prepare("SELECT COUNT(*) AS count FROM SHARE_NOTES WHERE id_share_user = ?")
    .get(req.user.id_user).count;

  return res.json({
    user: mapPublicUser(req.user),
    stats: {
      my_notes_count: myNotesCount,
      shared_with_me_count: sharedCount,
    },
  });
});

app.get("/api/admin/users", authRequired, adminRequired, (_req, res) => {
  const users = db
    .prepare(
      `SELECT id_user, name_user, email_user, role, is_blocked, created_at
       FROM USERS
       ORDER BY created_at DESC`
    )
    .all()
    .map(mapPublicUser);

  return res.json({ users });
});

app.patch("/api/admin/users/:id/block", authRequired, adminRequired, (req, res) => {
  const idUser = Number(req.params.id);
  const isBlocked = Number(req.body.is_blocked);

  if (!Number.isInteger(idUser) || ![0, 1].includes(isBlocked)) {
    return res.status(400).json({ message: "Invalid user id or is_blocked value" });
  }

  const info = db
    .prepare("UPDATE USERS SET is_blocked = ? WHERE id_user = ?")
    .run(isBlocked, idUser);

  if (info.changes === 0) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ message: "User block status updated", is_blocked: isBlocked });
});

app.delete("/api/admin/users/:id", authRequired, adminRequired, (req, res) => {
  const idUser = Number(req.params.id);
  if (!Number.isInteger(idUser)) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  if (idUser === req.user.id_user) {
    return res.status(400).json({ message: "Admin cannot delete own account" });
  }

  const info = db.prepare("DELETE FROM USERS WHERE id_user = ?").run(idUser);
  if (info.changes === 0) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({ message: "User deleted" });
});

app.get("/api/admin/notes", authRequired, adminRequired, (_req, res) => {
  const notes = db
    .prepare(
      `SELECT n.id_note, n.id_user, u.name_user, u.email_user, n.title_note, n.char_count, n.created_at, n.updated_at
       FROM NOTES n
       INNER JOIN USERS u ON u.id_user = n.id_user
       ORDER BY n.updated_at DESC`
    )
    .all();

  return res.json({ notes });
});

app.delete("/api/admin/notes/:id", authRequired, adminRequired, (req, res) => {
  const idNote = Number(req.params.id);
  if (!Number.isInteger(idNote)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  const info = db.prepare("DELETE FROM NOTES WHERE id_note = ?").run(idNote);
  if (info.changes === 0) {
    return res.status(404).json({ message: "Note not found" });
  }

  return res.json({ message: "Note deleted by admin" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  return res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
