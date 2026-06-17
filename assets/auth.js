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
  const info     = document.getElementById("user-info");
  const btnLogin = document.getElementById("btn-login");
  const avatar   = document.getElementById("user-avatar");
  const nameEl   = document.getElementById("user-name");

  if (user) {
    const meta = user.user_metadata || {};
    if (info)     info.classList.remove("hidden");
    if (btnLogin) btnLogin.classList.add("hidden");
    const avatarUrl = meta.avatar_url || "";
    if (avatar)  avatar.src = avatarUrl.startsWith("https://") ? avatarUrl : "";
    if (nameEl)  nameEl.textContent = meta.full_name || meta.user_name || user.email || "Usuario";
  } else {
    if (info)     info.classList.add("hidden");
    if (btnLogin) btnLogin.classList.remove("hidden");
  }

  if (typeof onAuthReady === "function") onAuthReady(user);
}

// ── Magic link (enlace mágico por email) ─────────────────────────────
async function loginWithMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: "https://sergi122.github.io/Animalinux/upload.html" }
  });
  if (error) throw error;
}

// ── GitHub OAuth (solo para usuarios con email público en GitHub) ─────
async function loginWithGitHub() {
  await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: "https://sergi122.github.io/Animalinux/upload.html" }
  });
}

async function logout() {
  await sb.auth.signOut();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-login")?.addEventListener("click", () => {
    document.getElementById("screen-login")?.classList.remove("hidden");
  });
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  initAuth();
});
