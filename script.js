/* app.js — MiniTube mejorado
   - thumbnails automáticas
   - likes y views persistentes
   - fecha de subida (uploadedAt)
   - orden: recientes / populares / título
   - manejo de objectURLs y fallback de miniatura
*/

const sampleVideos = [
  {
    id: "v1",
    title: "Flores (demo)",
    desc: "Video de ejemplo - MDN sample",
    src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    likes: 12,
    views: 102,
    uploadedAt: "2024-06-01T12:00:00.000Z",
    thumb: "" // se generará si es remoto (intento) o queda fallback
  },
  {
    id: "v2",
    title: "Big Buck Bunny (demo)",
    desc: "Animación de ejemplo",
    src: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
    likes: 5,
    views: 58,
    uploadedAt: "2024-07-15T09:30:00.000Z",
    thumb: ""
  }
];

// --- Estado y elementos ---
let videos = JSON.parse(localStorage.getItem("minitube_videos")) || sampleVideos.slice();
const videoListEl = document.getElementById("videoList");
const mainPlayer = document.getElementById("mainPlayer");
const mainTitle = document.getElementById("mainTitle");
const mainDesc = document.getElementById("mainDesc");
const likesEl = document.getElementById("likes");
const searchInput = document.getElementById("searchInput");
const uploadModal = document.getElementById("uploadModal");
const openUpload = document.getElementById("openUpload");
const cancelUpload = document.getElementById("cancelUpload");
const uploadForm = document.getElementById("uploadForm");

// Track generated object URLs to revoke later
const objectURLs = new Set();

// --- Utilidades ---
function saveState() {
  localStorage.setItem("minitube_videos", JSON.stringify(videos));
}

// Genera ID simple y consistente
function genId() {
  return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// Formatea fecha legible
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  } catch {
    return iso;
  }
}

// Intenta generar thumbnail (canvas) desde archivo o URL
function generateThumbnailFromFile(file, seekTime = 1) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = URL.createObjectURL(file);
    objectURLs.add(v.src);

    // wait for metadata then seek
    v.addEventListener("loadeddata", function onLoaded() {
      v.removeEventListener("loadeddata", onLoaded);
      // clamp seekTime
      const t = Math.min(seekTime, Math.max(0, v.duration - 0.1));
      v.currentTime = t;
    });

    v.addEventListener("seeked", function onSeeked() {
      try {
        const canvas = document.createElement("canvas");
        const w = 320, h = 180;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, w, h);
        const data = canvas.toDataURL("image/jpeg", 0.75);
        resolve(data);
      } catch (err) {
        resolve(""); // fallback
      } finally {
        // cleanup
        try { URL.revokeObjectURL(v.src); objectURLs.delete(v.src); } catch {}
      }
    });

    // errors -> fallback
    v.addEventListener("error", () => resolve(""));
    // safety timeout: if nothing happens in 3s, give up
    setTimeout(() => resolve(""), 3000);
  });
}

// If src is remote (string URL), try to capture a thumbnail by loading into video element
function generateThumbnailFromUrl(url, seekTime = 1) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "metadata";
    v.src = url;

    v.addEventListener("loadeddata", function onLoaded() {
      v.removeEventListener("loadeddata", onLoaded);
      const t = Math.min(seekTime, Math.max(0, v.duration - 0.1));
      v.currentTime = t;
    });

    v.addEventListener("seeked", function onSeeked() {
      try {
        const canvas = document.createElement("canvas");
        const w = 320, h = 180;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, w, h);
        const data = canvas.toDataURL("image/jpeg", 0.75);
        resolve(data);
      } catch (err) {
        resolve("");
      }
    });

    v.addEventListener("error", () => resolve(""));
    // timeout
    setTimeout(() => resolve(""), 3500);
  });
}

// --- UI: Insertar control de orden dentro de la sidebar si no existe ---
function ensureSortUI() {
  if (document.getElementById("sortBar")) return;
  const bar = document.createElement("div");
  bar.id = "sortBar";
  bar.style.display = "flex";
  bar.style.gap = "8px";
  bar.style.alignItems = "center";
  bar.style.marginBottom = "8px";

  const select = document.createElement("select");
  select.id = "sortSelect";
  ["recentes","populares","titulo"].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt[0].toUpperCase() + opt.slice(1);
    select.appendChild(o);
  });

  const label = document.createElement("label");
  label.style.fontSize = "13px";
  label.style.color = "rgba(255,255,255,0.75)";
  label.textContent = "Orden:";
  bar.appendChild(label);
  bar.appendChild(select);

  // Insert at top of videoList container's parent (sidebar)
  const sidebar = document.querySelector(".sidebar");
  sidebar.insertBefore(bar, videoListEl);

  select.addEventListener("change", () => {
    renderList(searchInput.value);
  });
}

// --- Renderizado de la lista con sorting y búsqueda ---
function renderList(filter = "") {
  ensureSortUI();
  const sortMode = document.getElementById("sortSelect")?.value || "recentes";

  videoListEl.innerHTML = "";
  const filtered = videos.filter(v => v.title.toLowerCase().includes(filter.toLowerCase()));

  if (filtered.length === 0) {
    videoListEl.innerHTML = "<p style='opacity:.7; padding:8px'>No hay videos</p>";
    return;
  }

  // Orden
  if (sortMode === "recentes") {
    filtered.sort((a,b)=> new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  } else if (sortMode === "populares") {
    filtered.sort((a,b)=> (b.views || 0) + (b.likes || 0)*2 - ((a.views || 0) + (a.likes || 0)*2));
  } else if (sortMode === "titulo") {
    filtered.sort((a,b)=> a.title.localeCompare(b.title));
  }

  filtered.forEach(v => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.display = "flex";
    card.style.gap = "10px";
    card.style.marginBottom = "10px";
    card.style.cursor = "pointer";
    card.style.padding = "6px";
    card.style.borderRadius = "8px";
    card.style.transition = "background .12s";

    // thumb fallback: if v.thumb is empty use a placeholder style
    const img = document.createElement("img");
    img.className = "thumb";
    if (v.thumb) {
      img.src = v.thumb;
    } else {
      img.src = ""; // triggers onerror
      img.style.background = "#000";
    }
    img.onerror = () => {
      img.style.background = "#000";
      img.src = ""; // ensure no broken icon
    };
    img.style.width = "140px";
    img.style.height = "78px";
    img.style.borderRadius = "6px";
    img.style.objectFit = "cover";

    const meta = document.createElement("div");
    meta.style.flex = "1";
    meta.innerHTML = `
      <div style="font-weight:600">${escapeHtml(v.title)}</div>
      <div class="metaSmall" style="margin-top:6px">${escapeHtml(v.desc || "")}</div>
      <div class="metaSmall" style="margin-top:6px; color:var(--muted); font-size:12px">
        👍 ${v.likes || 0} · 👁 ${v.views || 0} · ${v.uploadedAt ? fmtDate(v.uploadedAt) : ''}
      </div>
    `;
    card.appendChild(img);
    card.appendChild(meta);

    card.onclick = () => playVideo(v.id);
    videoListEl.appendChild(card);
  });
}

// escape minimal to avoid injecting HTML from titles/descs
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m)=>{
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
  });
}

// --- Reproducir video por id ---
function playVideo(id) {
  const v = videos.find(x => x.id === id);
  if (!v) return;

  // If src is an objectURL we track it, else nothing to do
  mainPlayer.src = v.src;
  mainPlayer.poster = v.thumb || "";
  mainTitle.textContent = v.title;
  mainDesc.textContent = v.desc || "";
  likesEl.textContent = `👍 ${v.likes || 0}`;

  // increment views once when user actually starts playing (not just set src)
  // We'll listen for 'playing' once
  const onPlaying = () => {
    mainPlayer.removeEventListener("playing", onPlaying);
    v.views = (v.views || 0) + 1;
    likesEl.textContent = `👍 ${v.likes || 0}`;
    saveState();
    renderList(searchInput.value); // update counts in list
  };
  mainPlayer.addEventListener("playing", onPlaying, { once: true });

  // Try autoplay. If browser blocks, user can press play.
  mainPlayer.play().catch(()=>{ /* ignore autoplay failures */ });

  // like button behavior (click)
  likesEl.onclick = (ev) => {
    ev.stopPropagation();
    v.likes = (v.likes || 0) + 1;
    likesEl.textContent = `👍 ${v.likes}`;
    saveState();
    renderList(searchInput.value);
  };
}

// --- Añadir video (subida local) ---
async function addLocalVideo({ title, desc, file }) {
  const id = genId();
  const blobUrl = URL.createObjectURL(file);
  objectURLs.add(blobUrl);

  // intentamos generar thumb desde el archivo (mejor UX)
  const thumb = await generateThumbnailFromFile(file) || "";

  const now = (new Date()).toISOString();
  const newV = {
    id,
    title,
    desc,
    src: blobUrl,
    likes: 0,
    views: 0,
    uploadedAt: now,
    thumb
  };
  videos.unshift(newV);
  saveState();
  renderList(searchInput.value);
  playVideo(id);
}

// --- Upload modal handlers ---
openUpload.addEventListener("click", () => uploadModal.classList.remove("hidden"));
cancelUpload.addEventListener("click", () => uploadModal.classList.add("hidden"));

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const title = form.title.value.trim() || "Sin título";
  const desc = form.desc.value.trim();
  const file = form.file.files[0];
  if (!file) return alert("Elige un archivo de video");
  await addLocalVideo({ title, desc, file });
  form.reset();
  uploadModal.classList.add("hidden");
});

// --- Búsqueda / Sort ---
searchInput.addEventListener("input", (e) => {
  renderList(e.target.value);
});

// --- Double-click en player para like rápido ---
mainPlayer.addEventListener("dblclick", () => {
  const src = mainPlayer.src;
  const item = videos.find(v => v.src === src);
  if (!item) return;
  item.likes = (item.likes || 0) + 1;
  likesEl.textContent = `👍 ${item.likes}`;
  saveState();
  renderList(searchInput.value);
});

// --- Cleanup object URLs on unload to avoid leaks (mostly for dev)
window.addEventListener("beforeunload", () => {
  objectURLs.forEach(u => {
    try { URL.revokeObjectURL(u); } catch {}
  });
});

// --- On first load, try to generate thumbnails for sample remote videos (best-effort) ---
async function ensureThumbnailsForRemote() {
  let changed = false;
  for (let v of videos) {
    if (!v.thumb && typeof v.src === "string" && v.src.startsWith("http")) {
      try {
        const t = await generateThumbnailFromUrl(v.src);
        if (t) {
          v.thumb = t;
          changed = true;
          saveState();
          renderList(searchInput.value);
        }
      } catch {}
    }
  }
  if (changed) renderList(searchInput.value);
}

// --- Inicialización ---
renderList();
if (videos.length) {
  // reproduce el primero si hay
  playVideo(videos[0].id);
}
// kick off thumbnail generation (non-blocking)
ensureThumbnailsForRemote();