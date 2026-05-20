const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/login.html";
}

const sidebar = document.getElementById("sidebar");
const layout = document.querySelector(".layout");
const menuBtn = document.getElementById("menuBtn");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const shareBtn = document.getElementById("shareBtn");
const logoutBtn = document.getElementById("logoutBtn");

const navHome = document.getElementById("navHome");
const navCreate = document.getElementById("navCreate");
const navMy = document.getElementById("navMy");
const navShared = document.getElementById("navShared");
const navProfile = document.getElementById("navProfile");
const navAdmin = document.getElementById("navAdmin");

const activeNoteLabel = document.getElementById("activeNoteLabel");
const charCountLabel = document.getElementById("charCountLabel");
const savedAtLabel = document.getElementById("savedAtLabel");
const appMessage = document.getElementById("appMessage");

const notesList = document.getElementById("notesList");
const searchInput = document.getElementById("searchInput");
const editorTitle = document.getElementById("editorTitle");
const editorBox = document.getElementById("editorBox");
const homeBox = document.getElementById("homeBox");
const profileBox = document.getElementById("profileBox");
const adminBox = document.getElementById("adminBox");

const titleInput = document.getElementById("titleInput");
const contentInput = document.getElementById("contentInput");
const shareEmailInput = document.getElementById("shareEmailInput");
const sharePermissionSelect = document.getElementById("sharePermissionSelect");
const shareList = document.getElementById("shareList");

let currentSection = "home";
let currentNotes = [];
let activeNote = null;
let canEditCurrent = false;
let canShareOrDeleteCurrent = false;
let currentUser = null;
let adminUsersCache = [];
let adminNotesCache = [];

function setMessage(text, type = "ok") {
  appMessage.textContent = text;
  appMessage.className = `message ${type}`;
}

function clearMessage() {
  setMessage("", "ok");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("uk-UA");
}

function updateTopbar() {
  activeNoteLabel.textContent = activeNote ? activeNote.title_note : "-";
  charCountLabel.textContent = activeNote ? String(activeNote.char_count || 0) : "0";
  savedAtLabel.textContent = activeNote ? formatDate(activeNote.updated_at) : "-";
}

function isAdminUser() {
  return currentUser && currentUser.role === 1;
}

function buildAdminUsersRows(users, emailFilter) {
  const filter = emailFilter.trim().toLowerCase();
  const filteredUsers = !filter
    ? users
    : users.filter((u) => u.email_user.toLowerCase().includes(filter));

  if (!filteredUsers.length) {
    return `
      <tr>
        <td colspan="6">Користувачів за таким email не знайдено</td>
      </tr>
    `;
  }

  return filteredUsers
    .map(
      (u) => `
      <tr>
        <td>${u.id_user}</td>
        <td>${u.name_user}</td>
        <td>${u.email_user}</td>
        <td>${u.role_label}</td>
        <td>${u.is_blocked === 1 ? "Так" : "Ні"}</td>
        <td class="admin-actions">
          <button data-admin-block="${u.id_user}" data-value="${u.is_blocked === 1 ? 0 : 1}">
            ${u.is_blocked === 1 ? "Розблокувати" : "Заблокувати"}
          </button>
          <button data-admin-delete-user="${u.id_user}">Видалити</button>
        </td>
      </tr>
    `
    )
    .join("");
}

function buildAdminNotesRows(notes, emailFilter) {
  const filter = emailFilter.trim().toLowerCase();
  const filteredNotes = !filter
    ? notes
    : notes.filter((n) => String(n.email_user || "").toLowerCase().includes(filter));

  if (!filteredNotes.length) {
    return `
      <tr>
        <td colspan="6">Нотаток для цього користувача не знайдено</td>
      </tr>
    `;
  }

  return filteredNotes
    .map(
      (n) => `
      <tr>
        <td>${n.id_note}</td>
        <td>${n.title_note}</td>
        <td>${n.name_user} (${n.email_user})</td>
        <td>${n.char_count}</td>
        <td>${formatDate(n.updated_at)}</td>
        <td><button data-admin-delete-note="${n.id_note}">Видалити</button></td>
      </tr>
    `
    )
    .join("");
}

function wireAdminActions() {
  document.querySelectorAll("[data-admin-block]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.adminBlock);
      const value = Number(btn.dataset.value);
      try {
        await api(`/api/admin/users/${id}/block`, {
          method: "PATCH",
          body: JSON.stringify({ is_blocked: value }),
        });
        setMessage("Статус блокування оновлено", "ok");
        await loadAdminPanel();
      } catch (error) {
        setMessage(error.message, "error");
      }
    });
  });

  document.querySelectorAll("[data-admin-delete-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.adminDeleteUser);
      if (!confirm("Видалити користувача?")) return;
      try {
        await api(`/api/admin/users/${id}`, { method: "DELETE" });
        setMessage("Користувача видалено", "ok");
        await loadAdminPanel();
      } catch (error) {
        setMessage(error.message, "error");
      }
    });
  });

  document.querySelectorAll("[data-admin-delete-note]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.adminDeleteNote);
      if (!confirm("Видалити нотатку?")) return;
      try {
        await api(`/api/admin/notes/${id}`, { method: "DELETE" });
        setMessage("Нотатку видалено", "ok");
        await loadAdminPanel();
      } catch (error) {
        setMessage(error.message, "error");
      }
    });
  });
}

function renderAdminPanel(emailFilter = "") {
  const usersRows = buildAdminUsersRows(adminUsersCache, emailFilter);
  const notesRows = buildAdminNotesRows(adminNotesCache, emailFilter);

  adminBox.innerHTML = `
    <h3>Адмін панель</h3>
    <div class="admin-grid">
      <div>
        <h4>Користувачі</h4>
        <div class="field">
          <label for="adminUserEmailFilter">Пошук користувача за email</label>
          <input id="adminUserEmailFilter" type="text" placeholder="Введіть email..." value="${emailFilter}" />
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ім'я</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Blocked</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>${usersRows}</tbody>
        </table>
      </div>
      <div>
        <h4>Усі нотатки</h4>
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Назва</th>
              <th>Власник</th>
              <th>Символи</th>
              <th>Оновлено</th>
              <th>Дія</th>
            </tr>
          </thead>
          <tbody>${notesRows}</tbody>
        </table>
      </div>
    </div>
  `;

  const adminUserEmailFilter = document.getElementById("adminUserEmailFilter");
  if (adminUserEmailFilter) {
    adminUserEmailFilter.addEventListener("input", () => {
      renderAdminPanel(adminUserEmailFilter.value);
    });
  }

  wireAdminActions();
}

function setEditorVisible(isVisible) {
  editorBox.classList.toggle("hidden", !isVisible);
  homeBox.classList.toggle("hidden", isVisible || currentSection !== "home");
  profileBox.classList.toggle("hidden", isVisible || currentSection !== "profile");
  adminBox.classList.toggle("hidden", isVisible || currentSection !== "admin");
}

function applyEditorPermissions() {
  titleInput.disabled = !canEditCurrent;
  contentInput.disabled = !canEditCurrent;
  saveBtn.disabled = !canEditCurrent;
  shareBtn.disabled = !canShareOrDeleteCurrent;
  shareEmailInput.disabled = !canShareOrDeleteCurrent;
  sharePermissionSelect.disabled = !canShareOrDeleteCurrent;
  deleteBtn.disabled = !canShareOrDeleteCurrent;
}

function resetEditor() {
  activeNote = null;
  titleInput.value = "";
  contentInput.value = "";
  shareEmailInput.value = "";
  canEditCurrent = false;
  canShareOrDeleteCurrent = false;
  shareList.innerHTML = "";
  applyEditorPermissions();
  updateTopbar();
}

async function loadShareListForActiveNote() {
  if (!activeNote || !canShareOrDeleteCurrent) {
    shareList.innerHTML = "";
    return;
  }

  try {
    const data = await api(`/api/notes/${activeNote.id_note}/shares`);
    if (!data) return;

    if (!data.shares.length) {
      shareList.innerHTML = "<strong>Наданий доступ:</strong><p>Поки що нікому не надано доступ.</p>";
      return;
    }

    const rows = data.shares
      .map(
        (item) => `
      <tr>
        <td>${item.name_user}</td>
        <td>${item.email_user}</td>
        <td>${item.permission_label}</td>
        <td><button data-share-revoke="${item.id_share_note}">Забрати доступ</button></td>
      </tr>
    `
      )
      .join("");

    shareList.innerHTML = `
      <strong>Наданий доступ:</strong>
      <table class="admin-table" style="margin-top: 8px">
        <thead>
          <tr>
            <th>Ім'я</th>
            <th>Email</th>
            <th>Дозвіл</th>
            <th>Дія</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    document.querySelectorAll("[data-share-revoke]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idShareNote = Number(btn.dataset.shareRevoke);
        if (!confirm("Забрати доступ у цього користувача?")) return;
        try {
          await api(`/api/shares/${idShareNote}`, { method: "DELETE" });
          setMessage("Доступ успішно забрано", "ok");
          await loadShareListForActiveNote();
        } catch (error) {
          setMessage(error.message, "error");
        }
      });
    });
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
    return null;
  }
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function renderNotes(list) {
  notesList.innerHTML = "";
  if (!list.length) {
    notesList.innerHTML = "<div class='note-item'>Нотаток не знайдено</div>";
    return;
  }

  list.forEach((note) => {
    const div = document.createElement("div");
    div.className = `note-item ${activeNote && activeNote.id_note === note.id_note ? "active" : ""}`;
    div.innerHTML = `
      <strong>${note.title_note}</strong>
      <div class="meta">Символів: ${note.char_count} | Оновлено: ${formatDate(note.updated_at)}</div>
    `;
    div.addEventListener("click", () => {
      openNote(note.id_note);
    });
    notesList.appendChild(div);
  });
}

function filterAndRenderNotes() {
  const search = searchInput.value.trim().toLowerCase();
  const filtered = currentNotes.filter((note) =>
    note.title_note.toLowerCase().includes(search)
  );
  renderNotes(filtered);
}

async function openNote(idNote) {
  try {
    clearMessage();
    const data = await api(`/api/notes/${idNote}`);
    if (!data) return;

    activeNote = data.note;
    titleInput.value = activeNote.title_note;
    contentInput.value = activeNote.content_note || "";

    canEditCurrent = activeNote.access_mode !== "view";
    canShareOrDeleteCurrent = activeNote.access_mode === "owner_or_admin";
    applyEditorPermissions();
    updateTopbar();
    setEditorVisible(true);
    await loadShareListForActiveNote();
    filterAndRenderNotes();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function loadMyNotes() {
  clearMessage();
  currentSection = "my";
  editorTitle.textContent = "Мої нотатки";
  const data = await api("/api/notes/my");
  if (!data) return;
  currentNotes = data.notes;
  resetEditor();
  setEditorVisible(true);
  filterAndRenderNotes();
}

async function loadSharedNotes() {
  clearMessage();
  currentSection = "shared";
  editorTitle.textContent = "Спільний доступ";
  const data = await api("/api/notes/shared");
  if (!data) return;
  currentNotes = data.notes;
  resetEditor();
  setEditorVisible(true);
  filterAndRenderNotes();
}

function showHome() {
  clearMessage();
  currentSection = "home";
  editorTitle.textContent = "Головна";
  currentNotes = [];
  notesList.innerHTML = "<div class='note-item'>Оберіть розділ зліва</div>";
  resetEditor();
  setEditorVisible(false);
}

async function loadProfile() {
  clearMessage();
  currentSection = "profile";
  editorTitle.textContent = "Профіль";
  currentNotes = [];
  notesList.innerHTML = "<div class='note-item'>Профіль відкрито</div>";
  resetEditor();
  setEditorVisible(false);

  const data = await api("/api/profile");
  if (!data) return;

  profileBox.innerHTML = `
    <h3>Профіль користувача</h3>
    <p><strong>Ім'я:</strong> ${data.user.name_user}</p>
    <p><strong>Email:</strong> ${data.user.email_user}</p>
    <p><strong>Роль:</strong> ${data.user.role_label}</p>
    <p><strong>Мої нотатки:</strong> ${data.stats.my_notes_count}</p>
    <p><strong>Спільні для мене:</strong> ${data.stats.shared_with_me_count}</p>
  `;
}

async function loadAdminPanel() {
  if (!isAdminUser()) {
    setMessage("Доступно тільки адміну", "error");
    return;
  }

  clearMessage();
  currentSection = "admin";
  editorTitle.textContent = "Адмін панель";
  currentNotes = [];
  notesList.innerHTML = "<div class='note-item'>Адмін режим</div>";
  resetEditor();
  setEditorVisible(false);

  const [usersData, notesData] = await Promise.all([
    api("/api/admin/users"),
    api("/api/admin/notes"),
  ]);

  if (!usersData || !notesData) return;

  adminUsersCache = usersData.users;
  adminNotesCache = notesData.notes;
  renderAdminPanel();
}

async function createNote() {
  clearMessage();
  const title = prompt("Введіть назву нотатки:", "Нова нотатка");
  if (!title) return;

  try {
    const data = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title_note: title, content_note: "" }),
    });
    setMessage("Нотатку створено", "ok");
    await loadMyNotes();
    await openNote(data.note.id_note);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function saveCurrentNote() {
  if (!activeNote) {
    setMessage("Спочатку оберіть нотатку", "error");
    return;
  }
  if (!canEditCurrent) {
    setMessage("У вас немає прав на редагування", "error");
    return;
  }

  try {
    const data = await api(`/api/notes/${activeNote.id_note}`, {
      method: "PUT",
      body: JSON.stringify({
        title_note: titleInput.value,
        content_note: contentInput.value,
      }),
    });

    activeNote = data.note;
    const savedNoteId = activeNote.id_note;
    charCountLabel.textContent = String(activeNote.char_count);
    savedAtLabel.textContent = formatDate(activeNote.updated_at);
    setMessage("Нотатку збережено", "ok");

    if (currentSection === "my") await loadMyNotes();
    if (currentSection === "shared") await loadSharedNotes();
    await openNote(savedNoteId);
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function deleteCurrentNote() {
  if (!activeNote) {
    setMessage("Немає активної нотатки", "error");
    return;
  }
  if (!canShareOrDeleteCurrent) {
    setMessage("Видаляти може тільки власник/адмін", "error");
    return;
  }

  const ok = confirm("Точно видалити нотатку?");
  if (!ok) return;

  try {
    await api(`/api/notes/${activeNote.id_note}`, { method: "DELETE" });
    setMessage("Нотатку видалено", "ok");
    await loadMyNotes();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function shareCurrentNote() {
  if (!activeNote) {
    setMessage("Немає активної нотатки", "error");
    return;
  }
  if (!canShareOrDeleteCurrent) {
    setMessage("Доступом ділиться тільки власник/адмін", "error");
    return;
  }

  const email = shareEmailInput.value.trim().toLowerCase();
  const permission = Number(sharePermissionSelect.value);
  if (!email) {
    setMessage("Введіть email користувача", "error");
    return;
  }

  try {
    const userData = await api(`/api/users/search?email=${encodeURIComponent(email)}`);
    const idShareUser = userData.user.id_user;

    await api(`/api/notes/${activeNote.id_note}/share`, {
      method: "POST",
      body: JSON.stringify({ id_share_user: idShareUser, permission }),
    });

    shareEmailInput.value = "";
    setMessage("Спільний доступ оновлено", "ok");
    await loadShareListForActiveNote();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

menuBtn.addEventListener("click", () => {
  const hidden = sidebar.classList.toggle("hidden-manual");
  layout.classList.toggle("sidebar-collapsed", hidden);
});

navHome.addEventListener("click", showHome);
navCreate.addEventListener("click", createNote);
navMy.addEventListener("click", () => {
  loadMyNotes().catch((error) => setMessage(error.message, "error"));
});
navShared.addEventListener("click", () => {
  loadSharedNotes().catch((error) => setMessage(error.message, "error"));
});
navProfile.addEventListener("click", () => {
  loadProfile().catch((error) => setMessage(error.message, "error"));
});
navAdmin.addEventListener("click", () => {
  loadAdminPanel().catch((error) => setMessage(error.message, "error"));
});

searchInput.addEventListener("input", filterAndRenderNotes);
contentInput.addEventListener("input", () => {
  charCountLabel.textContent = String(contentInput.value.length);
});
saveBtn.addEventListener("click", saveCurrentNote);
deleteBtn.addEventListener("click", deleteCurrentNote);
shareBtn.addEventListener("click", shareCurrentNote);

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (_error) {
  } finally {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login.html";
  }
});

(async function init() {
  try {
    const me = await api("/api/auth/me");
    if (!me) return;
    currentUser = me.user;

    if (!isAdminUser()) {
      navAdmin.style.display = "none";
    }

    showHome();
  } catch (error) {
    setMessage(error.message, "error");
    showHome();
  }
})();
