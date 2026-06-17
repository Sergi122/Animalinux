// ── Pack detail page ──────────────────────────────────────────────────
const POSE_LABELS = {
  default: "Base / parada",
  idle:    "Reposo (respira)",
  walk:    "Caminar",
  greet:   "Saludar",
  jump:    "Saltar",
  angry:   "Enojo",
  grab:    "Agarrar ratón",
};

// Orden visual de las poses
const POSE_ORDER = ["default", "idle", "walk", "greet", "jump", "angry", "grab"];

// Animaciones activas (para pararlas si se cambia de pestaña)
const activeAnimations = [];

// ── Extraer todos los frames de un .alpack ────────────────────────────
async function extractPackFrames(fileUrl) {
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`No se pudo descargar el pack (${resp.status})`);
  const buffer = await resp.arrayBuffer();
  const zip    = await JSZip.loadAsync(buffer);

  const meta = JSON.parse(await zip.file("mascot.json").async("string"));
  const poses = {};

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    // path: "poses/POSENAME/frame_0000.png"
    const m = path.match(/^poses\/([^/]+)\/(frame_\d+\.png)$/i);
    if (!m) continue;
    const poseName = m[1];
    if (!poses[poseName]) poses[poseName] = [];
    const blob = new Blob([await entry.async("arraybuffer")], { type: "image/png" });
    poses[poseName].push({ name: m[2], blob, url: URL.createObjectURL(blob) });
  }

  // Ordenar los frames por nombre dentro de cada pose
  for (const pose of Object.values(poses)) {
    pose.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  return { meta, poses };
}

// ── Cargar imágenes a objetos Image ───────────────────────────────────
function loadImages(frameList) {
  return Promise.all(frameList.map(f => new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => res(null);  // frame corrupto → ignorar
    img.src = f.url;
  })));
}

// ── Animar en un canvas ───────────────────────────────────────────────
function animateCanvas(canvas, images, fps) {
  const imgs = images.filter(Boolean);
  if (!imgs.length) return;

  const w = imgs[0].naturalWidth;
  const h = imgs[0].naturalHeight;
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  let frameIdx = 0;
  const msPerFrame = 1000 / Math.max(1, fps);
  let last = 0;

  function draw(ts) {
    if (ts - last >= msPerFrame) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(imgs[frameIdx], 0, 0);
      frameIdx = (frameIdx + 1) % imgs.length;
      last = ts;
    }
    const id = requestAnimationFrame(draw);
    activeAnimations.push(id);
  }
  requestAnimationFrame(draw);
}

// ── Mostrar la página ──────────────────────────────────────────────────
async function showPack(pack) {
  const isVida = (pack.poses || []).length > 1 ||
    ((pack.poses || []).length === 1 && pack.poses[0] !== "default");

  // Badges
  const badgeMode = document.getElementById("badge-mode");
  badgeMode.textContent = isVida ? "✦ Con vida" : "🎞 Animación simple";
  badgeMode.className   = "mode-badge " + (isVida ? "vida" : "simple");

  document.getElementById("badge-poses-count").textContent =
    `${(pack.poses || []).length} pose${(pack.poses||[]).length !== 1 ? "s" : ""}`;
  document.getElementById("badge-fps").textContent = `${pack.fps || 12} fps`;

  // Texto
  document.title = `${pack.name} — AnimaLinux`;
  document.getElementById("pack-name").textContent = pack.name;
  document.getElementById("pack-author").textContent =
    pack.author ? `Creado por ${pack.author}` : "";
  document.getElementById("pack-desc").textContent = pack.description || "";

  // Tags
  const tagsEl = document.getElementById("pack-tags");
  for (const tag of (pack.tags || [])) {
    const span = document.createElement("span");
    span.className = "tag-badge";
    span.textContent = tag;
    tagsEl.appendChild(span);
  }

  // Downloads
  document.getElementById("pack-downloads").textContent =
    `⬇ ${pack.downloads ?? 0} descargas`;

  // Botón descargar
  document.getElementById("btn-download").addEventListener("click", () => downloadPack(pack));

  // Mostrar pantalla
  document.getElementById("screen-loading").classList.add("hidden");
  document.getElementById("screen-pack").classList.remove("hidden");

  // ── Cargar frames del .alpack ──────────────────────────────────────
  const { data: { publicUrl } } = sb.storage
    .from(STORAGE_BUCKET_PACKS)
    .getPublicUrl(pack.file_path);

  let extractedPoses = null;
  let metaFps = pack.fps || 12;

  try {
    const result = await extractPackFrames(publicUrl);
    extractedPoses = result.poses;
    metaFps = result.meta.fps || metaFps;
  } catch (err) {
    console.warn("No se pudieron cargar los frames:", err);
  }

  // ── Hero canvas (pose default) ─────────────────────────────────────
  const heroCanvas  = document.getElementById("hero-canvas");
  const heroLoading = document.getElementById("hero-loading");

  if (extractedPoses?.default) {
    const imgs = await loadImages(extractedPoses.default);
    heroLoading.classList.add("hidden");
    animateCanvas(heroCanvas, imgs, metaFps);
  } else if (pack.preview_path) {
    // Fallback: imagen estática
    const { data } = sb.storage.from(STORAGE_BUCKET_PREVIEWS).getPublicUrl(pack.preview_path);
    heroLoading.classList.add("hidden");
    const ctx = heroCanvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      heroCanvas.width = img.naturalWidth;
      heroCanvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = data.publicUrl;
  } else {
    heroLoading.textContent = "😿";
  }

  // ── Sección de poses ───────────────────────────────────────────────
  if (isVida && extractedPoses) {
    document.getElementById("section-poses").classList.remove("hidden");
    document.getElementById("section-gif-only").classList.add("hidden");
    await buildPoseGrid(extractedPoses, pack.poses || [], metaFps);
  } else if (!isVida) {
    document.getElementById("section-gif-only").classList.remove("hidden");
  } else {
    // Con vida pero no se pudieron cargar los frames
    document.getElementById("section-poses").classList.remove("hidden");
    document.getElementById("section-poses").querySelector(".section-sub").textContent =
      "No se pudieron cargar las animaciones (prueba descargando el pack).";
  }
}

async function buildPoseGrid(extractedPoses, declaredPoses, fps) {
  const grid = document.getElementById("poses-grid");
  const tpl  = document.getElementById("pose-card-tpl");

  // Ordenar: primero las declaradas en POSE_ORDER, luego las extras
  const orderedPoses = [
    ...POSE_ORDER.filter(p => declaredPoses.includes(p)),
    ...declaredPoses.filter(p => !POSE_ORDER.includes(p)),
  ];

  for (const poseName of orderedPoses) {
    const frames = extractedPoses[poseName];
    if (!frames || frames.length === 0) continue;

    const card = tpl.content.cloneNode(true);
    const canvas  = card.querySelector(".pose-canvas");
    const loading = card.querySelector(".pose-canvas-loading");
    const label   = card.querySelector(".pose-label");
    const framesEl = card.querySelector(".pose-frames");

    label.textContent  = POSE_LABELS[poseName] || poseName;
    framesEl.textContent = `${frames.length} cuadro${frames.length !== 1 ? "s" : ""}`;

    grid.appendChild(card);

    // Cargar y animar (asíncrono para no bloquear el render)
    loadImages(frames).then(imgs => {
      loading.classList.add("hidden");
      animateCanvas(canvas, imgs, fps);
    });
  }
}

// ── Descargar ─────────────────────────────────────────────────────────
async function downloadPack(pack) {
  await sb.from("packs")
    .update({ downloads: (pack.downloads || 0) + 1 })
    .eq("id", pack.id);
  pack.downloads = (pack.downloads || 0) + 1;
  document.getElementById("pack-downloads").textContent =
    `⬇ ${pack.downloads} descargas`;

  const { data } = sb.storage.from(STORAGE_BUCKET_PACKS).getPublicUrl(pack.file_path);
  const a = document.createElement("a");
  a.href = data.publicUrl;
  a.download = pack.name.replace(/\s+/g, "_") + ".alpack";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get("id");

  if (!id) {
    showError("No se especificó ninguna mascota.");
    return;
  }

  const { data: pack, error } = await sb
    .from("packs")
    .select("*")
    .eq("id", id)
    .eq("verified", true)
    .single();

  if (error || !pack) {
    showError("No se encontró esa mascota en la galería.");
    return;
  }

  await showPack(pack);
});

function showError(msg) {
  document.getElementById("screen-loading").classList.add("hidden");
  document.getElementById("screen-error").classList.remove("hidden");
  document.getElementById("error-msg").textContent = msg;
}

// Pausar animaciones al cambiar de pestaña (ahorro de CPU)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    activeAnimations.forEach(id => cancelAnimationFrame(id));
    activeAnimations.length = 0;
  }
});
