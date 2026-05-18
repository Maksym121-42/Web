const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const escapeHtml = require('escape-html');
const { body, validationResult } = require('express-validator');

const app = express();

/* =========================
   SIMPLE IN-MEMORY STORAGE
========================= */
const users = [];
const grid = {
  generationMw: 125,
  demandMw: 113,
  adjustments: [],
  config: {
    balancingMode: 'auto',
    reservePercent: 12
  }
};

/* =========================
   SECURITY STATE
========================= */
const PASSWORD_MAX_AGE_DAYS = 90;
const failedLogins = new Map(); // key -> timestamps
const blockedIps = new Map(); // ip -> blockUntil
const deniedRequests = new Map(); // ip -> timestamps
const knownLoginIps = new Map(); // email -> Set(ip)

const WHITELIST = (process.env.CRITICAL_IP_WHITELIST || '127.0.0.1,::1')
  .split(',')
  .map((x) => x.trim());

function getIp(req) {
  const raw = req.ip || req.connection?.remoteAddress || '';
  return raw.replace('::ffff:', '');
}

function isIpBlocked(ip) {
  const until = blockedIps.get(ip);
  if (!until) return false;
  if (Date.now() > until) {
    blockedIps.delete(ip);
    return false;
  }
  return true;
}

function blockIp(ip, minutes, reason) {
  blockedIps.set(ip, Date.now() + minutes * 60 * 1000);
  console.warn('[INTRUSION_BLOCK]', { ip, minutes, reason, at: new Date().toISOString() });
}

function trackFailedLogin(email, ip) {
  const key = `${email}|${ip}`;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  const attempts = (failedLogins.get(key) || []).filter((t) => now - t < windowMs);
  attempts.push(now);
  failedLogins.set(key, attempts);

  if (attempts.length >= 4) {
    console.warn('[LOGIN_ANOMALY]', { email, ip, attempts10min: attempts.length });
  }
  if (attempts.length >= 7) {
    blockIp(ip, 15, 'too_many_failed_logins');
  }
}

function trackSuccessfulLogin(email, ip) {
  if (!knownLoginIps.has(email)) knownLoginIps.set(email, new Set());
  const ips = knownLoginIps.get(email);

  if (!ips.has(ip) && ips.size > 0) {
    console.warn('[LOGIN_ANOMALY_NEW_IP]', { email, ip, at: new Date().toISOString() });
  }
  ips.add(ip);
}

function passwordExpired(passwordUpdatedAt) {
  const diffDays = (Date.now() - new Date(passwordUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > PASSWORD_MAX_AGE_DAYS;
}

/* =========================
   PASSPORT
========================= */
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = users.find((u) => u.email === email);
        if (!user) return done(null, false, { message: 'Невірний email або пароль' });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: 'Невірний email або пароль' });

        if (passwordExpired(user.passwordUpdatedAt)) {
          return done(null, false, {
            code: 'PASSWORD_ROTATION_REQUIRED',
            message: 'Потрібна обовʼязкова зміна пароля'
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find((u) => u.id === id);
  done(null, user || false);
});

/* =========================
   MIDDLEWARES
========================= */
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'smart-grid-lab-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));

// Real-time intrusion detection (simple, but working)
app.use((req, res, next) => {
  const ip = getIp(req);

  if (isIpBlocked(ip)) {
    return res.status(423).json({ error: 'IP тимчасово заблокований системою захисту' });
  }

  res.on('finish', () => {
    if ([401, 403, 429].includes(res.statusCode)) {
      const now = Date.now();
      const arr = (deniedRequests.get(ip) || []).filter((t) => now - t < 60 * 1000);
      arr.push(now);
      deniedRequests.set(ip, arr);

      if (arr.length >= 15) {
        blockIp(ip, 10, 'too_many_denied_requests');
      }
    }
  });

  next();
});

const csrfProtection = csrf();

/* =========================
   HELPERS
========================= */
function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Потрібна автентифікація' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Потрібна автентифікація' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостатньо прав' });
    }
    return next();
  };
}

function requireWhitelistIp(req, res, next) {
  const ip = getIp(req);
  if (!WHITELIST.includes(ip)) {
    console.warn('[WHITELIST_BLOCK]', { ip, path: req.originalUrl });
    return res.status(403).json({ error: 'Ця критична операція дозволена лише з whitelist IP' });
  }
  return next();
}

/* =========================
   AUTH ENDPOINTS
========================= */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато спроб входу. Спробуйте пізніше.' }
});

app.get('/auth/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.post(
  '/auth/register',
  csrfProtection,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2, max: 50 }),
  body('role').isIn(['operator', 'analyst', 'administrator']),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;

    const email = req.body.email;
    const password = req.body.password;
    const name = escapeHtml(req.body.name);
    const role = req.body.role;

    if (users.some((u) => u.email === email)) {
      return res.status(409).json({ error: 'Користувач вже існує' });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = {
      id: `u_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      email,
      name,
      role,
      passwordHash: hash,
      passwordUpdatedAt: new Date().toISOString()
    };

    users.push(user);

    res.status(201).json({
      message: 'Реєстрація успішна',
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  }
);

app.post(
  '/auth/login',
  csrfProtection,
  loginLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8 }),
  (req, res, next) => {
    if (sendValidationErrors(req, res)) return;

    passport.authenticate('local', (err, user, info) => {
      const ip = getIp(req);

      if (err) return next(err);

      if (!user) {
        trackFailedLogin(req.body.email, ip);
        return res.status(401).json({
          error: info?.message || 'Помилка входу',
          code: info?.code || 'AUTH_FAILED'
        });
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);

        trackSuccessfulLogin(user.email, ip);

        return res.json({
          message: 'Вхід виконано',
          user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
      });
    })(req, res, next);
  }
);

app.post('/auth/logout', csrfProtection, requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.json({ message: 'Вихід виконано' });
    });
  });
});

app.get('/auth/status', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    }
  });
});

app.post(
  '/auth/rotate-password',
  csrfProtection,
  requireAuth,
  body('newPassword').isLength({ min: 8 }),
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;

    req.user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    req.user.passwordUpdatedAt = new Date().toISOString();

    res.json({ message: 'Пароль успішно змінено' });
  }
);

/* =========================
   API ENDPOINTS (TASK)
========================= */
app.get('/api/grid/balance', requireRole('operator', 'analyst'), (req, res) => {
  const balanceMw = grid.generationMw - grid.demandMw;
  res.json({
    generationMw: grid.generationMw,
    demandMw: grid.demandMw,
    balanceMw,
    updatedAt: new Date().toISOString()
  });
});

app.post(
  '/api/grid/adjust',
  csrfProtection,
  requireRole('operator'),
  body('changeMw').isFloat({ min: -50, max: 50 }),
  body('reason').trim().isLength({ min: 3, max: 120 }),
  (req, res) => {
    if (sendValidationErrors(req, res)) return;

    const changeMw = Number(req.body.changeMw);
    const reason = escapeHtml(req.body.reason);

    grid.demandMw += changeMw;
    grid.adjustments.push({
      at: new Date().toISOString(),
      by: req.user.email,
      changeMw,
      reason
    });

    res.json({
      message: 'Баланс мережі скориговано',
      demandMw: grid.demandMw,
      balanceMw: grid.generationMw - grid.demandMw
    });
  }
);

app.get('/api/forecasts', requireRole('analyst'), (req, res) => {
  const trend = grid.adjustments.slice(-5).reduce((sum, item) => sum + item.changeMw, 0);
  const predictedDemand = Math.max(0, grid.demandMw + trend);

  res.json({
    horizon: '3h',
    predictedDemandMw: predictedDemand,
    predictedGenerationMw: grid.generationMw,
    predictedBalanceMw: grid.generationMw - predictedDemand
  });
});

app.post(
  '/api/system/config',
  csrfProtection,
  requireRole('administrator'),
  requireWhitelistIp,
  body('balancingMode').optional().isIn(['auto', 'manual']),
  body('reservePercent').optional().isFloat({ min: 5, max: 40 }),
  (req, res) => {
    if (sendValidationErrors(req, res)) return;

    grid.config = {
      ...grid.config,
      ...req.body
    };

    res.json({
      message: 'Системну конфігурацію оновлено',
      config: grid.config
    });
  }
);

/* =========================
   ERROR HANDLERS
========================= */
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Невірний CSRF токен' });
  }
  return next(err);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутрішня помилка сервера' });
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Smart Grid server running on http://localhost:${PORT}`);
});