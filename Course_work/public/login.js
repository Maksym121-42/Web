const messageEl = document.getElementById("message");
const loginBtn = document.getElementById("loginBtn");
const toRegisterBtn = document.getElementById("toRegisterBtn");

function showMessage(text, type = "ok") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

toRegisterBtn.addEventListener("click", () => {
  window.location.href = "/register.html";
});

loginBtn.addEventListener("click", async () => {
  const email_user = document.getElementById("email_user").value.trim();
  const password_user = document.getElementById("password_user").value;

  showMessage("");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_user, password_user }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    showMessage("Вхід успішний. Переходимо в меню...", "ok");
    setTimeout(() => {
      window.location.href = "/app.html";
    }, 600);
  } catch (error) {
    showMessage(error.message, "error");
  }
});
