const jwt = require("jsonwebtoken");
const db = require("./db");

function getTokenFromHeader(headerValue) {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function authRequired(req, res, next) {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db
      .prepare(
        "SELECT id_user, name_user, email_user, role, is_blocked, created_at FROM USERS WHERE id_user = ?"
      )
      .get(payload.id_user);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({ message: "User is blocked" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 1) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

module.exports = { authRequired, adminRequired };
