/* =====================
   CONFIG GOOGLE SHEETS
===================== */
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzopku3BQfw4wqJYy35K8Tg2jXb8b3_RGFYy0CD5dwEte1EqUzpFOmg9XETgYViXK5Ulg/exec";

/* =====================
   VARIABLES GLOBALES
===================== */
let posts = JSON.parse(localStorage.getItem("posts")) || [];
let charts = {};
let editIndex = null;

/* =====================
   UTILITAIRES SCORE
===================== */
function calculateRawScore(platform, likes, comments, views) {
  const ratio = views > 0 ? (likes + comments) / views : 0;
  switch ((platform || "Reddit").toLowerCase()) {
    case "reddit":
      return (ratio * views * 0.1) + (Math.log10(views + 1) * 30) + (comments * 8) + (likes * 2);
    case "linkedin":
      return (ratio * views * 0.1) + (comments * 15) + (likes * 3) + (Math.log10(views + 1) * 10);
    case "twitter/x":
      return (ratio * views * 0.1) + (likes * 5) + (comments * 8) + (Math.log10(views + 1) * 15);
    case "instagram":
      return (ratio * views * 0.08) + (likes * 4) + (comments * 10) + (Math.log10(views + 1) * 20);
    case "tiktok":
      return (Math.log10(views + 1) * 50) + (ratio * views * 0.05) + (likes * 2) + (comments * 6);
    default:
      return (ratio * views * 0.1) + (comments * 6) + (likes * 2) + (Math.log10(views + 1) * 15);
  }
}

function normalizeScores(postsArray) {
  if (postsArray.length === 0) return postsArray;
  const raws = postsArray.map(p => calculateRawScore(p.platform, p.likes, p.comments, p.views));
  const logsRaws = raws.map(r => Math.log10(r + 1));
  const maxLog = Math.max(...logsRaws, 1);
  const minLog = Math.min(...logsRaws);
  const range = maxLog - minLog || 1;
  return postsArray.map((p, i) => ({
    ...p,
    score: Math.round(((logsRaws[i] - minLog) / range) * 9 * 10) / 10 + 1
  }));
}

/* =====================
   LOCAL STORAGE
===================== */
function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}

/* =====================
   SYNC GOOGLE SHEETS
===================== */
async function syncFromSheets(showFeedback = true) {
  const syncBtn = document.getElementById("sync-btn");
  const syncStatus = document.getElementById("sync-status");

  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:6px;"></span>Sync...`;
  }

  try {
    const response = await fetch(SHEETS_API_URL);
    if (!response.ok) throw new Error("Erreur réseau");
    const json = await response.json();
    if (!json.success || !json.data) throw new Error("Données invalides");

    let sheetPosts = json.data.map(convertSheetRow).filter(p => p.title && p.title.length > 2);
    sheetPosts = normalizeScores(sheetPosts);
    const manualPosts = posts.filter(p => !p.fromSheets);
    posts = [...sheetPosts, ...manualPosts];
    savePosts();
    try { refreshAll(); } catch(e){ console.error(e); }

    if (syncStatus) { 
      const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      syncStatus.textContent = `✓ ${sheetPosts.length} posts · ${now}`; 
      syncStatus.style.color = "#4ade80"; 
    }
    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `🔄 Synchroniser`; }
    if (showFeedback) showSyncToast(`✅ ${sheetPosts.length} posts synchronisés !`);

  } catch (err) {
    console.error("Sync error:", err);
    if (syncStatus) { syncStatus.textContent = "❌ Erreur sync"; syncStatus.style.color = "#f87171"; }
    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `🔄 Synchroniser`; }
    if (showFeedback) showSyncToast("❌ Erreur de connexion", true);
  }
}

function showSyncToast(message, isError = false) {
  const existing = document.getElementById("sync-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "sync-toast";
  toast.textContent = message;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${isError ? "#dc2626" : "#059669"};color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;font-family:var(--font);box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:9999;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* =====================
   NAVIGATION
===================== */
const menuItems = document.querySelectorAll(".sidebar-nav li");
const sections = {
  accueil: document.getElementById("section-accueil"),
  stats: document.getElementById("section-stats"),
  ia: document.getElementById("section-ia"),
  general: document.getElementById("section-general"),
  planning: document.getElementById("section-planning"),
  donnees: document.getElementById("section-donnees"),
};

function hideAllSections() {
  Object.values(sections).forEach(s => s && s.classList.add("hidden"));
}

function showSection(key) {
  if (!sections[key]) return;
  hideAllSections();
  sections[key].classList.remove("hidden");
  try {
    if (key === "stats") setTimeout(() => renderCharts(), 200);
    if (key === "accueil") setTimeout(() => renderHomeCharts(), 100);
    if (key === "planning" && typeof renderPlanning === "function") renderPlanning();
    if (key === "general") {
      const el = document.getElementById("global-insights");
      if (el) el.innerHTML = generateGlobalInsights();
    }
  } catch(e){ console.error(e); }
}

menuItems.forEach(item => {
  item.addEventListener("click", () => {
    const sec = item.dataset.section;
    if (!sec) return;
    menuItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    showSection(sec);
  });
});

/* =====================
   DATE ACCUEIL
===================== */
const dateEl = document.getElementById("current-date");
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/* =====================
   AUTRES FONCTIONS RESTANTES
===================== */
// Toutes tes fonctions existantes comme convertSheetRow, renderTable, add/edit posts, AI analysis, export CSV, getBestDayStats, getBestHourStats, etc.
// ... (ici tu peux copier tout le code restant de ton script original)
