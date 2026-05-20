const messageEl = document.getElementById("message");
const registerBtn = document.getElementById("registerBtn");
const toLoginBtn = document.getElementById("toLoginBtn");

function showMessage(text, type = "ok") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

toLoginBtn.addEventListener("click", () => {
  window.location.href = "/login.html";
});

registerBtn.addEventListener("click", async () => {
  const name_user = document.getElementById("name_user").value.trim();
  const email_user = document.getElementById("email_user").value.trim();
  const password_user = document.getElementById("password_user").value;

  showMessage("");

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_user, email_user, password_user }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    showMessage("Реєстрація успішна. Переходимо в меню...", "ok");
    setTimeout(() => {
      window.location.href = "/app.html";
    }, 600);
  } catch (error) {
    showMessage(error.message, "error");
  }
});
