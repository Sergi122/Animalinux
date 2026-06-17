// ── Auth (compartido entre páginas) ──────────────────────────────────
let currentUser = null;

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  setUser(session?.user ?? null);

  sb.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });
}

function setUser(user) {
  currentUser = user;
  const info    = document.getElementById("user-info");
  const btnLogin = document.getElementById("btn-login");
  const avatar  = document.getElementById("user-avatar");
  const nameEl  = document.getElementById("user-name");

  if (user) {
    const meta = user.user_metadata;
    if (info)    info.classList.remove("hidden");
    if (btnLogin) btnLogin.classList.add("hidden");
    // Solo aceptar URLs https:// para el avatar (evitar javascript: URLs)
    const avatarUrl = meta.avatar_url || "";
    if (avatar)  avatar.src = avatarUrl.startsWith("https://") ? avatarUrl : "";
    if (nameEl)  nameEl.textContent = meta.full_name || meta.user_name || user.email;
  } else {
    if (info)    info.classList.add("hidden");
    if (btnLogin) btnLogin.classList.remove("hidden");
  }

  // En la página de upload: mostrar el formulario o la pantalla de login
  if (typeof onAuthReady === "function") onAuthReady(user);
}

async function loginWithGitHub() {
  await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: "https://sergi122.github.io/Animalinux/upload.html" }
  });
}

async function logout() {
  await sb.auth.signOut();
}

// Conectar botones comunes del header
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-login")?.addEventListener("click", loginWithGitHub);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  initAuth();
});
