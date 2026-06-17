// ── Galería ───────────────────────────────────────────────────────────
const ALL_POSES = ["default", "idle", "walk", "greet", "jump", "angry", "grab"];

let allPacks = [];
let activeFilter = "";
let searchQuery  = "";

async function loadGallery() {
  const { data, error } = await sb
    .from("packs")
    .select("*")
    .eq("verified", true)
    .order("created_at", { ascending: false });

  if (error) {
    document.getElementById("gallery").innerHTML =
      `<p class="loading-msg" style="color:var(--red)">Error cargando galería: ${error.message}</p>`;
    return;
  }

  allPacks = data || [];
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById("gallery");
  const empty   = document.getElementById("empty-msg");
  const tpl     = document.getElementById("pack-card-tpl");

  let filtered = allPacks.filter(p => {
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery) ||
      (p.description || "").toLowerCase().includes(searchQuery) ||
      (p.author || "").toLowerCase().includes(searchQuery);
    const matchPose = !activeFilter ||
      (p.poses || []).includes(activeFilter);
    return matchSearch && matchPose;
  });

  gallery.innerHTML = "";

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const pack of filtered) {
    const card = tpl.content.cloneNode(true);

    // Preview
    const img = card.querySelector(".preview-img");
    if (pack.preview_path) {
      const { data } = sb.storage.from(STORAGE_BUCKET_PREVIEWS).getPublicUrl(pack.preview_path);
      img.src = data.publicUrl;
      img.alt = pack.name;
    } else {
      img.src = "assets/no-preview.png";
      img.classList.add("no-img");
      img.alt = "Sin preview";
    }

    // Pose count badge + modo vida
    const poses = pack.poses || [];
    const isVida = poses.length > 1 || (poses.length === 1 && poses[0] !== "default");
    const poseCountEl = card.querySelector(".pose-count");
    poseCountEl.textContent = isVida
      ? `✦ Con vida · ${poses.length} poses`
      : "🎞 Simple";
    poseCountEl.style.background = isVida
      ? "rgba(124,111,224,0.7)"
      : "rgba(0,0,0,0.55)";

    // Nombre y autor
    card.querySelector(".card-name").textContent = pack.name;
    card.querySelector(".card-author").textContent = pack.author
      ? `por ${pack.author}`
      : "";

    // Descripción
    const descEl = card.querySelector(".card-desc");
    descEl.textContent = pack.description || "";
    if (!pack.description) descEl.style.display = "none";

    // Badges de poses
    const posesEl = card.querySelector(".card-poses");
    for (const p of ALL_POSES) {
      const b = document.createElement("span");
      b.className = "pose-badge" + (poses.includes(p) ? " has" : "");
      b.textContent = p;
      posesEl.appendChild(b);
    }

    // Downloads
    card.querySelector(".card-downloads").textContent =
      `⬇ ${pack.downloads ?? 0} descargas`;

    // Click en la tarjeta → página de detalle
    const article = card.querySelector(".pack-card");
    article.style.cursor = "pointer";
    article.addEventListener("click", e => {
      if (e.target.closest(".btn-download")) return;
      window.location.href = `pack.html?id=${pack.id}`;
    });

    // Botón descargar (sin navegar a detalle)
    const dlBtn = card.querySelector(".btn-download");
    dlBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      downloadPack(pack);
    });

    gallery.appendChild(card);
  }
}

async function downloadPack(pack) {
  // Incrementar contador
  await sb.from("packs")
    .update({ downloads: (pack.downloads || 0) + 1 })
    .eq("id", pack.id);

  // Descargar archivo
  const { data } = sb.storage
    .from(STORAGE_BUCKET_PACKS)
    .getPublicUrl(pack.file_path);

  const a = document.createElement("a");
  a.href = data.publicUrl;
  a.download = pack.name.replace(/\s+/g, "_") + ".alpack";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Refrescar contador en local
  pack.downloads = (pack.downloads || 0) + 1;
}

// ── Eventos ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadGallery();

  // Búsqueda con debounce
  let searchTimer;
  document.getElementById("search")?.addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderGallery();
    }, 250);
  });

  // Filtro por poses
  document.getElementById("pose-filters")?.addEventListener("click", e => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    activeFilter = pill.dataset.pose;
    renderGallery();
  });
});
