let csrfToken = '';

const out = document.getElementById('out');
const csrfView = document.getElementById('csrfView');

function show(data) {
  out.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function api(url, method = 'GET', body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers['x-csrf-token'] = csrfToken;

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  return { ok: res.ok, status: res.status, payload };
}

async function refreshCsrf() {
  const r = await api('/auth/csrf-token');
  if (r.ok && r.payload.csrfToken) {
    csrfToken = r.payload.csrfToken;
    csrfView.textContent = csrfToken;
  }
  show(r);
}

document.getElementById('btnCsrf').onclick = refreshCsrf;

document.getElementById('btnRegister').onclick = async () => {
  const data = {
    email: document.getElementById('regEmail').value,
    name: document.getElementById('regName').value,
    password: document.getElementById('regPassword').value,
    role: document.getElementById('regRole').value
  };
  show(await api('/auth/register', 'POST', data));
};

document.getElementById('btnLogin').onclick = async () => {
  const data = {
    email: document.getElementById('loginEmail').value,
    password: document.getElementById('loginPassword').value
  };
  show(await api('/auth/login', 'POST', data));
};

document.getElementById('btnLogout').onclick = async () => {
  show(await api('/auth/logout', 'POST', {}));
};

document.getElementById('btnStatus').onclick = async () => {
  show(await api('/auth/status'));
};

document.getElementById('btnRotate').onclick = async () => {
  const data = { newPassword: document.getElementById('newPassword').value };
  show(await api('/auth/rotate-password', 'POST', data));
};

document.getElementById('btnBalance').onclick = async () => {
  show(await api('/api/grid/balance'));
};

document.getElementById('btnAdjust').onclick = async () => {
  const data = {
    changeMw: Number(document.getElementById('adjMw').value),
    reason: document.getElementById('adjReason').value
  };
  show(await api('/api/grid/adjust', 'POST', data));
};

document.getElementById('btnForecast').onclick = async () => {
  show(await api('/api/forecasts'));
};

document.getElementById('btnConfig').onclick = async () => {
  const data = {
    balancingMode: document.getElementById('cfgMode').value,
    reservePercent: Number(document.getElementById('cfgReserve').value)
  };
  show(await api('/api/system/config', 'POST', data));
};

refreshCsrf();