/* =====================
   CONFIG GOOGLE SHEETS
===================== */
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzopku3BQfw4wqJYy35K8Tg2jXb8b3_RGFYy0CD5dwEte1EqUzpFOmg9XETgYViXK5Ulg/exec";
 
/* =====================
   VARIABLES GLOBALES
===================== */
let posts = JSON.parse(localStorage.getItem("posts")) || [];
let charts = {};
 
function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}
 
/* =====================
   SCORE ADAPTATIF PAR PLATEFORME (sur 10)
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
 
  // Utiliser log pour réduire l'écart entre le post viral et les autres
  const logsRaws = raws.map(r => Math.log10(r + 1));
  const maxLog = Math.max(...logsRaws, 1);
  const minLog = Math.min(...logsRaws);
  const range = maxLog - minLog || 1;
 
  return postsArray.map((p, i) => ({
    ...p,
    // Score entre 1 et 10 avec distribution équilibrée
    score: Math.round(((logsRaws[i] - minLog) / range) * 9 * 10) / 10 + 1
  }));
}
 
/* =====================
   SYNC GOOGLE SHEETS
===================== */
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
 
function convertSheetRow(row) {
  let dateStr = "";
  if (row["Date publication"]) {
    const raw = String(row["Date publication"]).trim();
    if (raw.match(/^\d{2}\/\d{2}\/\d{4}/)) {
      const parts = raw.split("/");
      dateStr = `${parts[2].substring(0,4)}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
    } else if (raw.match(/^\d{4}\s+\d{2}:\d{2}-\d{2}-\d{2}/)) {
      const year = raw.substring(0, 4);
      const rest = raw.split("-");
      dateStr = `${year}-${rest[1].padStart(2,"0")}-${rest[2].substring(0,2).padStart(2,"0")}`;
    } else if (raw.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parts = raw.substring(0,10).split("-");
      dateStr = parseInt(parts[1]) > 12
        ? `${parts[0]}-${parts[2]}-${parts[1]}`
        : `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
  }
 
  let timeStr = "09:00";
  if (row["Heure"]) {
    const raw = String(row["Heure"]).trim();
    if (raw.match(/^\d{1,2}:\d{2}/)) timeStr = raw.substring(0, 5).padStart(5, "0");
    else if (raw.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)) timeStr = raw.split(" ")[1].substring(0, 5);
  }
 
  const likes = Number(row["Likes"]) || 0;
  const comments = Number(row["Commentaires"]) || 0;
  const views = Number(row["Vues"]) || 0;
  const platform = String(row["Plateforme"] || "Reddit");
  const engagement = likes + comments;
 
  let jour = String(row["Jour (auto)"] || "").trim();
  if (!jour && dateStr) jour = new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long" });
 
  const timeParts = timeStr.split(":");
  const heureDecimale = Number(timeParts[0]) + Number(timeParts[1] || 0) / 60;
 
  return { platform, date: dateStr, time: timeStr, author: String(row["Auteur"] || ""), title: String(row["Titre"] || ""), likes, comments, views, engagement, jour, score: 0, heureDecimale, fromSheets: true };
}
 
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
    refreshAll();
 
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (syncStatus) { syncStatus.textContent = `✓ ${sheetPosts.length} posts · ${now}`; syncStatus.style.color = "#4ade80"; }
    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `🔄 Synchroniser`; }
    if (showFeedback) showSyncToast(`✅ ${sheetPosts.length} posts synchronisés !`);
 
  } catch (err) {
    console.error("Sync error:", err);
    if (syncStatus) { syncStatus.textContent = "❌ Erreur sync"; syncStatus.style.color = "#f87171"; }
    if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `🔄 Synchroniser`; }
    if (showFeedback) showSyncToast("❌ Erreur de connexion", true);
  }
}
 
/* =====================
   DATE D'ACCUEIL
===================== */
const dateEl = document.getElementById("current-date");
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  calendrier: document.getElementById("section-calendrier"),
  planning: document.getElementById("section-planning"),
  donnees: document.getElementById("section-donnees"),
};
 
function hideAllSections() {
  Object.values(sections).forEach(s => s && s.classList.add("hidden"));
}
 
function showSection(key) {
  hideAllSections();
  if (sections[key]) sections[key].classList.remove("hidden");
  if (key === "stats") setTimeout(() => renderCharts(), 200);
  if (key === "accueil") setTimeout(() => renderHomeCharts(), 100);
  if (key === "planning") renderPlanning();
  if (key === "general") document.getElementById("global-insights").innerHTML = generateGlobalInsights();
  if (key === "calendrier") renderCalendrierSection();
}
 
menuItems.forEach(item => {
  item.addEventListener("click", () => {
    menuItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    showSection(item.dataset.section);
  });
});
 
/* =====================
   UTILITAIRES
===================== */
function detectPostType(title) {
  const t = title.toLowerCase();
  if (t.includes("?")) return "Question";
  if (t.includes("je ") || t.includes("mon histoire") || t.includes("mon expérience")) return "Storytelling";
  if (t.includes("pourquoi") || t.includes("faut-il") || t.includes("selon vous")) return "Opinion";
  if (t.includes("comment") || t.includes("astuce") || t.includes("conseil")) return "Conseil";
  return "Post mixte";
}
 
function extractKeywords(title) {
  const stopwords = [
    // Articles et déterminants
    "pour", "dans", "avec", "cette", "sans", "mais", "plus", "très", "tout", "aussi",
    "bien", "après", "même", "comme", "dont", "être", "avoir", "faire", "dire",
    "aller", "voir", "vouloir", "pouvoir", "devoir", "savoir", "votre", "notre",
    "leurs", "leur", "nous", "vous", "ils", "elle", "elles", "nous", "cela", "ceci",
    "quand", "alors", "donc", "mais", "ainsi", "encore", "toujours", "jamais",
    "déjà", "vraiment", "trop", "moins", "plus", "assez", "enfin", "depuis",
    "pendant", "avant", "après", "entre", "contre", "vers", "sous", "chez",
    "donne", "comme", "rester", "envie", "chose", "faire", "prend", "faut",
    "avoir", "être", "quel", "quelle", "quels", "quelles", "quel",
    "une", "les", "des", "que", "qui", "quoi", "comment", "quand", "pourquoi",
    "parce", "selon", "dont", "lors", "puis", "tout", "tous", "toute", "toutes",
    "voilà", "voici", "chez", "part", "fois", "coup", "bout", "aide", "fait",
    "mise", "mise", "pris", "doit", "peut", "fais", "dites", "dits"
  ];
 
  return title
    .toLowerCase()
    .replace(/[.,!?…:;«»"'()[\]{}\/\\]/g, " ")
    .split(/\s+/)
    .filter(w =>
      w.length >= 5 &&                    // Au moins 5 caractères
      !stopwords.includes(w) &&           // Pas un mot vide
      !/^\d+$/.test(w) &&                // Pas un nombre seul
      !/^(https?|www)/.test(w)           // Pas une URL
    );
}
 
function getBestDayStats() {
  if (posts.length < 2) return null;
  const byDay = {};
  posts.forEach(p => {
    if (!byDay[p.jour]) byDay[p.jour] = { totalScore: 0, count: 0 };
    byDay[p.jour].totalScore += p.score; byDay[p.jour].count++;
  });
  let best = null, bestAvg = -Infinity;
  Object.keys(byDay).forEach(day => {
    const avg = byDay[day].totalScore / byDay[day].count;
    if (avg > bestAvg) { bestAvg = avg; best = day; }
  });
  return { bestDay: best, bestAvg };
}
 
function getBestHourStats() {
  if (posts.length < 2) return null;
  const byHour = {};
  posts.forEach(p => {
    const h = Math.floor(p.heureDecimale || 0);
    if (!byHour[h]) byHour[h] = { totalScore: 0, count: 0 };
    byHour[h].totalScore += p.score; byHour[h].count++;
  });
  let best = null, bestAvg = -Infinity;
  Object.keys(byHour).forEach(h => {
    const avg = byHour[h].totalScore / byHour[h].count;
    if (avg > bestAvg) { bestAvg = avg; best = h; }
  });
  return { bestHour: best, bestAvg };
}
 
function getSimilarPostsScore(keywords) {
  const similar = posts.filter(p => keywords.some(k => p.title.toLowerCase().includes(k)));
  if (similar.length === 0) return null;
  return { count: similar.length, avgScore: similar.reduce((a, b) => a + b.score, 0) / similar.length };
}
 
/* =====================
   TABLEAU
===================== */
const dataBody = document.getElementById("data-body");
const emptyState = document.getElementById("empty-state");
 
function renderTable() {
  dataBody.innerHTML = "";
  if (posts.length === 0) {
    emptyState && emptyState.classList.remove("hidden");
    updateStats();
    return;
  }
  emptyState && emptyState.classList.add("hidden");
 
  posts.forEach((post, index) => {
    const row = document.createElement("tr");
    const pct = post.score / 10;
    const scoreClass = pct > 0.6 ? "high" : pct > 0.3 ? "mid" : "low";
 
    // Formater la date en jj/mm/aaaa
    let dateDisplay = post.date;
    if (post.date) {
      const raw = String(post.date).trim();
      if (raw.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Format YYYY-MM-DD → jj/mm/aaaa
        const parts = raw.substring(0,10).split("-");
        dateDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else if (raw.match(/^\d{2}\/\d{2}\/\d{4}/)) {
        // Déjà en jj/mm/aaaa
        dateDisplay = raw;
      }
    }
    row.innerHTML = `
      <td>${post.platform}</td>
      <td>${dateDisplay}</td>
      <td>${post.time}</td>
      <td>${post.author}</td>
      <td title="${post.title}">${post.title}${post.url ? ` <a href="${post.url}" target="_blank" style="color:var(--blue);font-size:10px;">↗</a>` : ""}</td>
      <td>${post.likes}</td>
      <td>${post.comments}</td>
      <td>${post.needsViews ? `<span style="color:var(--orange);font-weight:600;cursor:pointer;" onclick="promptViews(${index})" title="Clique pour renseigner les vues">+ Vues</span>` : post.views.toLocaleString("fr-FR")}</td>
      <td><span class="score-badge ${scoreClass}">${post.score}</span></td>
      <td>
        <div class="action-btns">
          <button class="edit-btn" data-index="${index}">Modifier</button>
          <button class="delete-btn" data-index="${index}">Supprimer</button>
          <button class="analyze-btn" data-index="${index}">IA ✦</button>
        </div>
      </td>`;
    dataBody.appendChild(row);
  });
  updateStats();
}
 
function promptViews(index) {
  const post = posts[index];
  const views = prompt(`Combien de vues pour ce post ?\n\n"${post.title.substring(0, 60)}..."`);
  if (views === null) return;
  const viewsNum = Number(views);
  if (isNaN(viewsNum) || viewsNum < 0) { alert("Nombre de vues invalide"); return; }
  posts[index].views = viewsNum;
  posts[index].needsViews = false;
  posts[index].engagement = posts[index].likes + posts[index].comments;
  posts = normalizeScores(posts);
  savePosts();
  renderTable();
}
 
/* =====================
   AJOUT / MODIFICATION
===================== */
const addPostBtn = document.getElementById("add-post");
const cancelEditBtn = document.getElementById("cancel-edit");
const formTitle = document.getElementById("form-title");
let editIndex = null;
 
function clearForm() {
  ["post-platform","post-date","post-time","post-author","post-title","post-likes","post-comments","post-views"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}
 
addPostBtn.addEventListener("click", () => {
  const platform = document.getElementById("post-platform").value;
  const date = document.getElementById("post-date").value;
  const time = document.getElementById("post-time").value;
  const author = document.getElementById("post-author").value;
  const title = document.getElementById("post-title").value;
  const likes = Number(document.getElementById("post-likes").value) || 0;
  const comments = Number(document.getElementById("post-comments").value) || 0;
  const views = Number(document.getElementById("post-views").value) || 0;
 
  if (!platform || !date || !time || !author || !title) { alert("Merci de remplir tous les champs."); return; }
 
  const engagement = likes + comments;
  const jour = new Date(date).toLocaleDateString("fr-FR", { weekday: "long" });
  const heureDecimale = Number(time.split(":")[0]) + Number(time.split(":")[1]) / 60;
  const rawScore = calculateRawScore(platform, likes, comments, views);
  const allRaws = posts.map(p => calculateRawScore(p.platform, p.likes, p.comments, p.views));
  const maxRaw = Math.max(...allRaws, rawScore, 1);
  const score = Math.round((rawScore / maxRaw) * 100) / 10;
 
  const newPost = { platform, date, time, author, title, likes, comments, views, engagement, jour, score, heureDecimale };
 
  if (editIndex === null) {
    posts.push(newPost);
  } else {
    posts[editIndex] = newPost;
    exitEditMode();
  }
 
  // Re-normaliser tous les scores
  posts = normalizeScores(posts);
  savePosts();
  renderTable();
  clearForm();
});
 
cancelEditBtn && cancelEditBtn.addEventListener("click", () => { exitEditMode(); clearForm(); });
 
function exitEditMode() {
  editIndex = null;
  addPostBtn.textContent = "Ajouter";
  formTitle.textContent = "Ajouter un post manuellement";
  cancelEditBtn && cancelEditBtn.classList.add("hidden");
}
 
/* =====================
   CLICS TABLEAU
===================== */
document.addEventListener("click", e => {
  const target = e.target;
 
  if (target.classList.contains("delete-btn")) {
    if (!confirm("Supprimer ce post ?")) return;
    posts.splice(Number(target.dataset.index), 1);
    posts = normalizeScores(posts);
    savePosts(); renderTable(); return;
  }
 
  if (target.classList.contains("edit-btn")) {
    const index = Number(target.dataset.index);
    const post = posts[index];
    editIndex = index;
    document.getElementById("post-platform").value = post.platform;
    document.getElementById("post-date").value = post.date;
    document.getElementById("post-time").value = post.time;
    document.getElementById("post-author").value = post.author;
    document.getElementById("post-title").value = post.title;
    document.getElementById("post-likes").value = post.likes;
    document.getElementById("post-comments").value = post.comments;
    document.getElementById("post-views").value = post.views;
    addPostBtn.textContent = "Mettre à jour";
    formTitle.textContent = "Modifier le post";
    cancelEditBtn && cancelEditBtn.classList.remove("hidden");
    menuItems.forEach(i => i.classList.remove("active"));
    const donneeItem = Array.from(menuItems).find(i => i.dataset.section === "donnees");
    if (donneeItem) { donneeItem.classList.add("active"); showSection("donnees"); }
    return;
  }
 
  if (target.classList.contains("analyze-btn")) {
    const post = posts[Number(target.dataset.index)];
    menuItems.forEach(i => i.classList.remove("active"));
    const iaItem = Array.from(menuItems).find(i => i.dataset.section === "ia");
    if (iaItem) { iaItem.classList.add("active"); showSection("ia"); }
    document.getElementById("input-text").value = post.title;
    runAIAnalysis(post.title);
    return;
  }
});
 
/* =====================
   STATS ACCUEIL
===================== */
function updateStats() {
  document.getElementById("total-posts").textContent = posts.length;
  if (posts.length === 0) {
    document.getElementById("avg-score").textContent = "0";
    document.getElementById("success-rate").textContent = "0%";
    document.getElementById("best-day-home").textContent = "—";
    return;
  }
  const avg = posts.reduce((a, b) => a + (b.score || 0), 0) / posts.length;
  document.getElementById("avg-score").textContent = avg.toFixed(1);
  const success = (posts.filter(p => p.score >= 5).length / posts.length) * 100;
  document.getElementById("success-rate").textContent = success.toFixed(1) + "%";
  const dayStats = getBestDayStats();
  document.getElementById("best-day-home").textContent = dayStats ? dayStats.bestDay : "—";
}
 
/* =====================
   EXPORT CSV
===================== */
function exportCSV() {
  if (posts.length === 0) { alert("Aucune donnée à exporter."); return; }
  const headers = ["Plateforme","Date","Heure","Auteur","Titre","Likes","Commentaires","Vues","Score"];
  const rows = posts.map(p => [p.platform, p.date, p.time, p.author, `"${p.title.replace(/"/g,'""')}"`, p.likes, p.comments, p.views, p.score].join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `jobsansfiltre_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}
 
document.getElementById("export-csv").addEventListener("click", exportCSV);
const exportBtn2 = document.getElementById("export-csv-2");
if (exportBtn2) exportBtn2.addEventListener("click", exportCSV);
 
const syncBtnEl = document.getElementById("sync-btn");
if (syncBtnEl) syncBtnEl.addEventListener("click", () => syncFromSheets(true));
/* =====================
   ANALYSE IA
===================== */
const analyzeBtn = document.getElementById("analyze-btn");
const aiResult = document.getElementById("ai-result");
const inputText = document.getElementById("input-text");
const aiLoading = document.getElementById("ai-loading");
 
const SIGNALS_POSITIFS = {
  question: ["?", "selon vous", "votre avis", "vous pensez"],
  emotion: ["incroyable", "choqué", "honte", "fier", "épuisé", "absurde", "scandale"],
  storytelling: ["j'ai vécu", "mon histoire", "mon expérience", "j'ai été", "j'ai reçu", "j'ai quitté"],
  chiffres: [/\d+\s*(ans?|mois|semaines?|€|k€|entretiens?)/, /\d+\s*%/, /\d+\s*(candidatures?|refus)/],
  polémique: ["personne ne dit", "vérité", "sans filtre", "réalité", "arnaque", "injuste"],
  conseil: ["comment", "astuce", "conseil", "guide", "méthode"],
};
 
const CONSEILS_PAR_TYPE = {
  "Question": "Les questions directes génèrent 40% plus de commentaires. Assure-toi que ta question est ouverte.",
  "Storytelling": "Les posts storytelling ont le meilleur taux de lecture. Commence par l'élément le plus émotionnel.",
  "Opinion": "Les opinions tranchées divisent et engagent. N'aie pas peur de prendre position.",
  "Conseil": "Les posts conseils fonctionnent mieux avec un résultat concret dans le titre.",
  "Post mixte": "Choisis un angle dominant : question, récit ou conseil.",
};
 
const TEMPLATES_TITRES = [
  (kw) => `Pourquoi ${kw} est le vrai problème du recrutement en France`,
  (kw) => `J'ai vécu ça : ${kw} et ce que j'ai appris`,
  (kw) => `${kw} : ce que les RH ne vous diront jamais`,
  (kw) => `La vérité sur ${kw} (témoignage sans filtre)`,
  (kw) => `Comment j'ai géré ${kw} et ce que ça m'a appris`,
];
 
function analyserTitreAvance(titre) {
  const t = titre.toLowerCase();
  const mots = extractKeywords(titre);
  let score = 3.0;
  const pointsForts = [], pointsFaibles = [];
 
  if (titre.length >= 40 && titre.length <= 100) { score += 1.2; pointsForts.push("Longueur idéale"); }
  else if (titre.length < 15) { score -= 1.5; pointsFaibles.push("Titre trop court"); }
  else if (titre.length > 130) { score -= 0.8; pointsFaibles.push("Titre trop long"); }
 
  if (SIGNALS_POSITIFS.question.some(s => t.includes(s))) { score += 1.0; pointsForts.push("Format question → favorise les commentaires"); }
  if (SIGNALS_POSITIFS.emotion.some(s => t.includes(s))) { score += 1.3; pointsForts.push("Mot émotionnel → fort impact sur le clic"); }
  if (SIGNALS_POSITIFS.storytelling.some(s => t.includes(s))) { score += 1.1; pointsForts.push("Angle storytelling → très performant sur Reddit"); }
  if (SIGNALS_POSITIFS.chiffres.some(r => r instanceof RegExp ? r.test(t) : t.includes(r))) { score += 0.9; pointsForts.push("Chiffre concret → crédibilité et curiosité"); }
  if (SIGNALS_POSITIFS.polémique.some(s => t.includes(s))) { score += 1.2; pointsForts.push("Ton polémique → très viral sur r/jobsansfiltre"); }
  if (SIGNALS_POSITIFS.conseil.some(s => t.includes(s))) { score += 0.7; pointsForts.push("Format conseil → bon taux de sauvegarde"); }
 
  if (mots.length < 2) pointsFaibles.push("Peu de mots-clés forts");
 
  score = Math.min(10, Math.max(0, score));
  const potentiel = score >= 6.5 ? "Élevé" : score >= 4 ? "Moyen" : "Faible";
  const motCle = mots[0] || "recrutement";
  const type = detectPostType(titre);
  const alts = [...TEMPLATES_TITRES].sort(() => Math.random() - 0.5).slice(0, 3).map(fn => fn(motCle));
  const bestDay = getBestDayStats();
  const bestHour = getBestHourStats();
  const momentConseil = bestDay && bestHour
    ? `D'après tes données, publie le ${bestDay.bestDay} vers ${bestHour.bestHour}h.`
    : "Publie en semaine entre 12h-14h ou le soir vers 20h-22h.";
 
  return {
    type, score_estime: Math.round(score * 10) / 10, potentiel,
    points_forts: pointsForts.length ? pointsForts : ["Structure correcte"],
    points_faibles: pointsFaibles.length ? pointsFaibles : ["Rien de bloquant"],
    titres_alternatifs: alts, mots_cles: mots.slice(0, 5),
    meilleur_moment: momentConseil, conseil_global: CONSEILS_PAR_TYPE[type] || CONSEILS_PAR_TYPE["Post mixte"],
  };
}
 
function runAIAnalysis(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) { alert("Colle un titre à analyser."); return; }
  aiResult.innerHTML = "";
  aiLoading.classList.remove("hidden");
  setTimeout(() => {
    const data = analyserTitreAvance(cleanTitle);
    aiLoading.classList.add("hidden");
    renderAIResult(data);
  }, 700);
}
 
function renderAIResult(data) {
  const potentielColor = data.potentiel === "Élevé" ? "var(--green)" : data.potentiel === "Moyen" ? "var(--blue)" : "var(--text-3)";
  const potentielBg = data.potentiel === "Élevé" ? "var(--green-light)" : data.potentiel === "Moyen" ? "var(--blue-light)" : "var(--surface-2)";
  aiResult.innerHTML = `
    <div class="ai-cards-grid">
      <div class="ai-card">
        <h3>Type de post</h3>
        <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;">${data.type}</div>
        <div style="display:inline-block;background:${potentielBg};border:1px solid ${potentielColor};padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;color:${potentielColor};">Potentiel ${data.potentiel}</div>
      </div>
      <div class="ai-card">
        <h3>Score estimé</h3>
        <div class="score-big" style="color:${potentielColor}">${data.score_estime}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">sur 10</div>
        <div style="margin-top:10px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${data.score_estime * 10}%;background:${potentielColor};border-radius:3px;"></div>
        </div>
      </div>
      <div class="ai-card"><h3>✅ Points forts</h3><ul>${data.points_forts.map(p => `<li>${p}</li>`).join("")}</ul></div>
      <div class="ai-card"><h3>⚠️ Points à améliorer</h3><ul>${data.points_faibles.map(p => `<li>${p}</li>`).join("")}</ul></div>
      <div class="ai-card"><h3>🏷️ Mots-clés</h3><div class="tag-list">${data.mots_cles.map(k => `<span class="tag">${k}</span>`).join("") || "<span style='color:var(--text-3)'>Aucun</span>"}</div></div>
      <div class="ai-card"><h3>⏰ Meilleur moment</h3><p>${data.meilleur_moment}</p></div>
      <div class="ai-card wide">
        <h3>📝 Titres alternatifs <span style="font-weight:400;color:var(--text-3);font-size:11px;">(clique pour copier)</span></h3>
        ${data.titres_alternatifs.map(t => `<div class="alt-title" onclick="copyTitle(this,'${t.replace(/'/g,"\\'")}')">📋 ${t}</div>`).join("")}
      </div>
      <div class="ai-card wide"><h3>🧠 Conseil expert</h3><p>${data.conseil_global}</p></div>
    </div>`;
}
 
function copyTitle(el, title) {
  navigator.clipboard.writeText(title).then(() => {
    const orig = el.innerHTML;
    el.innerHTML = "✅ Copié !";
    el.style.borderColor = "var(--green)"; el.style.color = "var(--green)";
    setTimeout(() => { el.innerHTML = orig; el.style.borderColor = ""; el.style.color = ""; }, 1500);
  });
}
 
analyzeBtn && analyzeBtn.addEventListener("click", () => runAIAnalysis(inputText.value));
 
/* =====================
   ANALYSE GÉNÉRALE
===================== */
function generateGlobalInsights() {
  if (posts.length === 0) return `<div class="ai-card"><p style="color:var(--text-3)">Aucune donnée. Clique sur <strong>🔄 Synchroniser</strong>.</p></div>`;
 
  // Performance par type
  const typeScores = {};
  posts.forEach(p => {
    const type = detectPostType(p.title);
    if (!typeScores[type]) typeScores[type] = { total: 0, count: 0 };
    typeScores[type].total += p.score; typeScores[type].count++;
  });
 
  // Mots-clés — avec score moyen ET nombre d'occurrences minimum
  const keywordMap = {};
  posts.forEach(p => {
    const keywords = extractKeywords(p.title);
    // Dédoublonner par post pour éviter qu'un seul post viral fausse tout
    const unique = [...new Set(keywords)];
    unique.forEach(k => {
      if (!keywordMap[k]) keywordMap[k] = { totalScore: 0, count: 0, posts: [] };
      keywordMap[k].totalScore += p.score;
      keywordMap[k].count++;
      keywordMap[k].posts.push(p.score);
    });
  });
 
  // Filtrer : au moins 2 occurrences pour être significatif
  const validKeywords = Object.keys(keywordMap).filter(k => keywordMap[k].count >= 2);
 
  // Top 5 mots qui performent le mieux (score moyen élevé)
  const topKeywords = validKeywords
    .sort((a,b) => (keywordMap[b].totalScore/keywordMap[b].count) - (keywordMap[a].totalScore/keywordMap[a].count))
    .slice(0, 5);
 
  // Bottom 5 mots à éviter (score moyen faible)
  const weakKeywords = validKeywords
    .sort((a,b) => (keywordMap[a].totalScore/keywordMap[a].count) - (keywordMap[b].totalScore/keywordMap[b].count))
    .slice(0, 5);
 
  const dayStats = getBestDayStats();
  const hourStats = getBestHourStats();
  const bestType = Object.keys(typeScores).sort((a,b) =>
    (typeScores[b].total/typeScores[b].count) - (typeScores[a].total/typeScores[a].count)
  )[0];
 
  return `
    <div class="insights-grid">
      <div class="ai-card">
        <h3>📊 Performance par type</h3>
        ${Object.keys(typeScores)
          .sort((a,b) => (typeScores[b].total/typeScores[b].count) - (typeScores[a].total/typeScores[a].count))
          .map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:14px;">${t}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:11px;color:var(--text-3);">${typeScores[t].count} posts</span>
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--blue);">${(typeScores[t].total/typeScores[t].count).toFixed(1)}</span>
            </div>
          </div>`).join("")}
      </div>
 
      <div class="ai-card">
        <h3>🏷️ Mots-clés qui boostent</h3>
        <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Présents dans min. 2 posts performants</p>
        <div class="tag-list" style="margin-bottom:10px;">
          ${topKeywords.map(k => `<span class="tag">${k}</span>`).join("") || "<span style='color:var(--text-3);font-size:13px;'>Pas assez de données</span>"}
        </div>
        ${topKeywords.map(k => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text-2);">${k} <span style="color:var(--text-3);font-size:11px;">(${keywordMap[k].count}x)</span></span>
            <span style="font-family:var(--font-mono);font-weight:600;color:var(--green);">↑ ${(keywordMap[k].totalScore/keywordMap[k].count).toFixed(1)}</span>
          </div>`).join("")}
      </div>
 
      <div class="ai-card">
        <h3>⚠️ Mots-clés à éviter</h3>
        <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">Associés aux posts les moins performants</p>
        ${weakKeywords.map(k => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text-2);">${k} <span style="color:var(--text-3);font-size:11px;">(${keywordMap[k].count}x)</span></span>
            <span style="font-family:var(--font-mono);font-weight:600;color:var(--red);">↓ ${(keywordMap[k].totalScore/keywordMap[k].count).toFixed(1)}</span>
          </div>`).join("")}
      </div>
 
      <div class="ai-card">
        <h3>📅 Meilleur jour</h3>
        <div style="font-size:28px;font-weight:700;margin-bottom:4px;">${dayStats ? dayStats.bestDay : "—"}</div>
        <div style="font-size:13px;color:var(--text-3);">Score moyen : <strong>${dayStats ? dayStats.bestAvg.toFixed(1) : "—"}</strong></div>
      </div>
 
      <div class="ai-card">
        <h3>⏰ Meilleure heure</h3>
        <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);margin-bottom:4px;">${hourStats ? hourStats.bestHour + "h" : "—"}</div>
        <div style="font-size:13px;color:var(--text-3);">Score moyen : <strong>${hourStats ? hourStats.bestAvg.toFixed(1) : "—"}</strong></div>
      </div>
 
      <div class="ai-card" style="grid-column:span 2;">
        <h3>🧠 Synthèse stratégique</h3>
        <p style="font-size:15px;line-height:1.8;">
          Tes posts de type <strong>${bestType}</strong> sont les plus performants (score moyen <strong>${(typeScores[bestType]?.total/typeScores[bestType]?.count).toFixed(1)}</strong>).
          Publie de préférence le <strong>${dayStats ? dayStats.bestDay : "?"}</strong> vers <strong>${hourStats ? hourStats.bestHour + "h" : "?"}</strong>.
          ${topKeywords.length >= 2 ? `Les mots <strong>${topKeywords.slice(0,3).join("</strong>, <strong>")}</strong> sont associés à tes meilleurs posts.` : ""}
          ${weakKeywords.length >= 2 ? `Évite les titres avec <strong>${weakKeywords.slice(0,2).join("</strong> et <strong>")}</strong> qui performent moins bien.` : ""}
        </p>
      </div>
    </div>`;
}
 
/* =====================
   CALENDRIER ÉDITORIAL
===================== */
function renderCalendrierSection() {
  const el = document.getElementById("calendrier-content");
  if (!el) return;
  if (posts.length < 3) {
    el.innerHTML = `<div class="ai-card"><p style="color:var(--text-3);">Synchronise tes données d'abord pour générer le calendrier.</p></div>`;
    return;
  }
 
  // Récupérer le planning généré
  const joursOrdre = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const today = new Date();
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
 
  // Calculer meilleurs créneaux
  const slotMap = {};
  posts.forEach(p => {
    const key = `${p.jour}|${Math.floor(p.heureDecimale || 0)}`;
    if (!slotMap[key]) slotMap[key] = { day: p.jour, hour: Math.floor(p.heureDecimale || 0), total: 0, count: 0 };
    slotMap[key].total += p.score; slotMap[key].count++;
  });
  const topSlots = Object.values(slotMap)
    .map(s => ({ ...s, avg: s.total / s.count }))
    .sort((a,b) => b.avg - a.avg);
 
  // Fréquence : 1 post tous les 2 jours, max 2 par jour sur les jours actifs
  // On publie seulement 4 jours sur 7 (les meilleurs jours selon les données)
  const joursByScore = {};
  posts.forEach(p => {
    if (!joursByScore[p.jour]) joursByScore[p.jour] = { total: 0, count: 0 };
    joursByScore[p.jour].total += p.score;
    joursByScore[p.jour].count++;
  });
  const meilleurJours = Object.keys(joursByScore)
    .sort((a,b) => (joursByScore[b].total/joursByScore[b].count) - (joursByScore[a].total/joursByScore[a].count))
    .slice(0, 4); // Les 4 meilleurs jours seulement
 
  const postsParJourActif = 1; // 1 post par défaut, 2 si c'est le meilleur jour
 
  // Plateformes utilisées
  const platformCount = {};
  posts.forEach(p => { platformCount[p.platform] = (platformCount[p.platform] || 0) + 1; });
  const platforms = Object.keys(platformCount).sort((a,b) => platformCount[b] - platformCount[a]);
 
  // Mots-clés performants
  const keywordMap = {};
  posts.forEach(p => {
    extractKeywords(p.title).forEach(k => {
      if (!keywordMap[k]) keywordMap[k] = { total: 0, count: 0 };
      keywordMap[k].total += p.score; keywordMap[k].count++;
    });
  });
  const topKw = Object.keys(keywordMap)
    .filter(k => keywordMap[k].count >= 2)
    .sort((a,b) => (keywordMap[b].total/keywordMap[b].count) - (keywordMap[a].total/keywordMap[a].count))
    .slice(0, 15);
 
  // Meilleurs jours selon les données — on publie seulement ces jours-là
  const joursByScore2 = {};
  posts.forEach(p => {
    if (!joursByScore2[p.jour]) joursByScore2[p.jour] = { total: 0, count: 0 };
    joursByScore2[p.jour].total += p.score;
    joursByScore2[p.jour].count++;
  });
  const meilleurJours2 = Object.keys(joursByScore2)
    .sort((a,b) => (joursByScore2[b].total/joursByScore2[b].count) - (joursByScore2[a].total/joursByScore2[a].count))
    .slice(0, 4);
 
  const bestSlot = topSlots[0];
  const totalPostsSemaine = meilleurJours2.length + 1;
 
  let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;">
      <div class="stat-card" data-color="blue">
        <div class="stat-label">Posts cette semaine</div>
        <div class="stat-value">~${totalPostsSemaine}</div>
        <div class="stat-trend">${meilleurJours2.length} jours actifs</div>
      </div>
      <div class="stat-card" data-color="green">
        <div class="stat-label">Meilleur créneau</div>
        <div class="stat-value" style="font-size:20px;">${bestSlot ? bestSlot.day.substring(0,3) + " " + bestSlot.hour + "h" : "—"}</div>
        <div class="stat-trend">score ${bestSlot ? bestSlot.avg.toFixed(1) : "—"}</div>
      </div>
      <div class="stat-card" data-color="purple">
        <div class="stat-label">Plateforme principale</div>
        <div class="stat-value" style="font-size:18px;">${platforms[0] || "—"}</div>
        <div class="stat-trend">${platformCount[platforms[0]] || 0} posts</div>
      </div>
      <div class="stat-card" data-color="orange">
        <div class="stat-label">Top mot-clé</div>
        <div class="stat-value" style="font-size:18px;">${topKw[0] || "—"}</div>
        <div class="stat-trend">le plus performant</div>
      </div>
    </div>
 
    <div class="chart-card" style="margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">`;
 
  for (let d = 0; d < 7; d++) {
    const dayIdx = (todayIdx + d) % 7;
    const jourNom = joursOrdre[dayIdx];
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() + d);
    const dateStr = dateObj.toLocaleDateString("fr-FR", { day:"numeric", month:"short" });
    const isToday = d === 0;
    const isActif = meilleurJours2.includes(jourNom);
    // Le meilleur jour a 2 posts, les autres 1
    const nbPosts = isActif ? (jourNom === meilleurJours2[0] ? 2 : 1) : 0;
    const daySlots = topSlots.filter(s => s.day === jourNom).slice(0, nbPosts);
    const slotsToUse = daySlots.length > 0 ? daySlots : topSlots.slice(0, nbPosts);
 
    html += `
      <div style="border:2px solid ${isToday ? "var(--blue)" : isActif ? "var(--green)" : "var(--border)"};border-radius:var(--radius);overflow:hidden;opacity:${isActif ? "1" : "0.45"};">
        <div style="background:${isToday ? "var(--blue)" : isActif ? "var(--green-light)" : "var(--surface-2)"};color:${isToday ? "white" : "var(--text)"};padding:8px;text-align:center;">
          <div style="font-weight:700;font-size:13px;text-transform:capitalize;">${jourNom.substring(0,3).toUpperCase()}</div>
          <div style="font-size:11px;opacity:0.8;">${dateStr}</div>
          ${isToday ? `<div style="font-size:9px;margin-top:2px;background:white;color:var(--blue);border-radius:10px;padding:1px 6px;font-weight:700;">AUJOURD'HUI</div>` : ""}
          ${!isActif ? `<div style="font-size:9px;color:var(--text-3);margin-top:2px;">repos</div>` : ""}
        </div>
        <div style="padding:6px;">
          ${slotsToUse.map((s, si) => {
            const tplIdx = (d * 3 + si * 4) % ALL_TEMPLATES.length;
            const kw = topKw[(d * 2 + si) % Math.max(topKw.length, 1)] || "post";
            return `<div style="background:var(--surface-2);border-radius:6px;padding:6px 8px;margin-bottom:4px;font-size:11px;">
              <div style="font-weight:700;color:var(--blue);">${s.hour}h00</div>
              <div style="color:var(--text-2);">${ALL_TEMPLATES[tplIdx].type}</div>
              <div style="color:var(--text-3);font-size:10px;">${platforms[0] || "Reddit"} · ${kw}</div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }
 
  html += `</div></div>`;
 
  // LISTE DÉTAILLÉE — uniquement les jours actifs
  html += `<div class="chart-card"><div style="font-weight:700;font-size:15px;margin-bottom:16px;">📋 Détail des publications</div>`;
 
  window._calPosts = {};
  let calIdx = 0;
 
  for (let d = 0; d < 7; d++) {
    const dayIdx = (todayIdx + d) % 7;
    const jourNom = joursOrdre[dayIdx];
    if (!meilleurJours2.includes(jourNom)) continue; // Jours de repos ignorés
 
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() + d);
    const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
    const isToday = d === 0;
    const nbPosts = jourNom === meilleurJours2[0] ? 2 : 1;
    const daySlots = topSlots.filter(s => s.day === jourNom).slice(0, nbPosts);
    const slotsToUse = daySlots.length > 0 ? daySlots : topSlots.slice(0, nbPosts);
 
    html += `
      <div style="border-left:3px solid ${isToday ? "var(--blue)" : "var(--green)"};padding-left:16px;margin-bottom:20px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;text-transform:capitalize;">
          ${isToday ? "🔵 " : "🟢 "}${dateStr}
          ${isToday ? `<span style="background:var(--blue);color:white;font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;margin-left:8px;">AUJOURD'HUI</span>` : ""}
        </div>`;
 
    slotsToUse.forEach((slot, si) => {
      const platform = platforms[si % platforms.length] || "Reddit";
      const kw = topKw[(d * 2 + si * 3 + 1) % Math.max(topKw.length, 1)] || "recrutement";
      const tplIdx = (d * 3 + si * 4 + d + si) % ALL_TEMPLATES.length;
      const template = ALL_TEMPLATES[tplIdx];
      const postType = template.type;
      const contenu = template.fn(kw, platform);
      window._calPosts[calIdx] = contenu;
 
      html += `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--blue);font-size:13px;">🕐 ${slot.hour}h00</span>
              <span style="font-size:11px;background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:20px;">${platform}</span>
              <span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:20px;font-weight:600;">${postType}</span>
              <span style="font-size:11px;background:var(--green-light);color:var(--green);padding:2px 8px;border-radius:20px;">🏷️ ${kw}</span>
            </div>
            <button onclick="copyCalPost(this,${calIdx})" style="background:var(--green-light);color:var(--green);border:1px solid var(--green);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--font);font-weight:600;">📋 Copier</button>
          </div>
          <details>
            <summary style="cursor:pointer;font-size:13px;color:var(--blue);font-weight:600;user-select:none;">✍️ Voir le post complet</summary>
            <div style="margin-top:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8;color:var(--text-2);white-space:pre-wrap;">${contenu.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
          </details>
        </div>`;
      calIdx++;
    });
 
    html += `</div>`;
  }
 
  html += `</div>`;
  el.innerHTML = html;
}
 
function copyCalPost(btn, idx) {
  const content = window._calPosts?.[idx];
  if (!content) return;
  navigator.clipboard.writeText(content).then(() => {
    btn.textContent = "✅ Copié !";
    setTimeout(() => { btn.textContent = "📋 Copier"; }, 2000);
  });
}
function renderPlanning() {
  renderCalendar();
  renderBestSlots();
  renderWeeklyPlanner();
}
 
function renderBestSlots() {
  const slotsEl = document.getElementById("best-slots");
  if (!slotsEl) return;
  if (posts.length < 3) {
    slotsEl.innerHTML = `<p style="color:var(--text-3);font-size:14px;">Ajoute au moins 3 posts pour voir tes meilleurs créneaux.</p>`;
    return;
  }
  const slotMap = {};
  posts.forEach(p => {
    const key = `${p.jour}|${Math.floor(p.heureDecimale || 0)}`;
    if (!slotMap[key]) slotMap[key] = { day: p.jour, hour: Math.floor(p.heureDecimale || 0), total: 0, count: 0 };
    slotMap[key].total += p.score; slotMap[key].count++;
  });
  const slots = Object.values(slotMap).map(s => ({ ...s, avg: s.total / s.count })).sort((a,b) => b.avg - a.avg).slice(0, 5);
  slotsEl.innerHTML = slots.map((s, i) => `
    <div class="slot-item">
      <span class="slot-day">${i === 0 ? "🥇 " : i === 1 ? "🥈 " : ""}${s.day}</span>
      <span class="slot-hour">${s.hour}h–${s.hour+1}h</span>
      <span class="slot-score">${s.avg.toFixed(1)}</span>
    </div>`).join("");
}
 
function renderCalendar() {
  const calEl = document.getElementById("calendar-grid");
  if (!calEl) return;
  const jours = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const heures = [8,9,10,11,12,13,14,15,16,17,18,19,20,21];
  const heatmap = {};
  posts.forEach(p => {
    const h = Math.floor(p.heureDecimale || 0);
    const key = `${p.jour}|${h}`;
    if (!heatmap[key]) heatmap[key] = { total: 0, count: 0 };
    heatmap[key].total += p.score;
    heatmap[key].count++;
  });
  const maxScore = Math.max(...Object.values(heatmap).map(v => v.total/v.count), 1);
  let html = `<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;font-size:12px;">
    <thead><tr>
      <th style="padding:6px 10px;text-align:left;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);">Heure</th>
      ${jours.map(j => `<th style="padding:6px 8px;text-align:center;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);min-width:80px;">${j.charAt(0).toUpperCase()+j.slice(1)}</th>`).join("")}
    </tr></thead><tbody>`;
  heures.forEach(h => {
    html += `<tr><td style="padding:5px 10px;color:var(--text-3);font-family:var(--font-mono);font-size:11px;border-bottom:1px solid var(--border);white-space:nowrap;">${h}h</td>`;
    jours.forEach(j => {
      const data = heatmap[`${j}|${h}`];
      if (data) {
        const avg = data.total / data.count;
        const intensity = avg / maxScore;
        const bg = intensity > 0.7 ? "#059669" : intensity > 0.4 ? "#3b82f6" : intensity > 0.2 ? "#8b5cf6" : "#e8eaf0";
        const textColor = intensity > 0.2 ? "white" : "var(--text-3)";
        html += `<td style="padding:5px 4px;text-align:center;border-bottom:1px solid var(--border);"><div title="${j} ${h}h — score ${avg.toFixed(1)}" style="background:${bg};color:${textColor};border-radius:6px;padding:4px 2px;font-weight:700;font-size:11px;">${avg.toFixed(1)}</div></td>`;
      } else {
        html += `<td style="padding:5px 4px;text-align:center;border-bottom:1px solid var(--border);"><div style="background:var(--surface-2);border-radius:6px;padding:4px 2px;color:var(--border);font-size:11px;">·</div></td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table>
    <div style="display:flex;gap:12px;margin-top:12px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:11px;color:var(--text-3);">Légende :</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:11px;"><span style="background:#059669;width:12px;height:12px;border-radius:3px;display:inline-block;"></span> Excellent</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:11px;"><span style="background:#3b82f6;width:12px;height:12px;border-radius:3px;display:inline-block;"></span> Bon</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:11px;"><span style="background:#8b5cf6;width:12px;height:12px;border-radius:3px;display:inline-block;"></span> Moyen</span>
      <span style="display:flex;align-items:center;gap:4px;font-size:11px;"><span style="background:#e8eaf0;width:12px;height:12px;border-radius:3px;display:inline-block;"></span> Peu de données</span>
    </div></div>`;
  calEl.innerHTML = html;
}
 
/* =====================
   PLANNING SEMAINE INTELLIGENT
===================== */
function renderWeeklyPlanner() {
  const el = document.getElementById("weekly-planner");
  if (!el) return;
  if (posts.length < 5) {
    el.innerHTML = `<div class="ai-card"><p style="color:var(--text-3);">Ajoute au moins 5 posts pour générer un planning intelligent.</p></div>`;
    return;
  }
  el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-3);">
    <div class="loading-spinner" style="margin:0 auto 10px;"></div>
    <p>Génération du planning en cours...</p>
  </div>`;
  setTimeout(() => {
    const planning = generateWeeklyPlan();
    el.innerHTML = planning;
  }, 600);
}
 
function generateWeeklyPlan() {
  // 1. Détecter les plateformes utilisées
  const platformCount = {};
  posts.forEach(p => {
    platformCount[p.platform] = (platformCount[p.platform] || 0) + 1;
  });
  const platforms = Object.keys(platformCount).sort((a,b) => platformCount[b] - platformCount[a]);
 
  // 2. Calculer meilleurs créneaux par jour
  const slotMap = {};
  posts.forEach(p => {
    const key = `${p.jour}|${Math.floor(p.heureDecimale || 0)}`;
    if (!slotMap[key]) slotMap[key] = { day: p.jour, hour: Math.floor(p.heureDecimale || 0), total: 0, count: 0 };
    slotMap[key].total += p.score;
    slotMap[key].count++;
  });
  const topSlots = Object.values(slotMap)
    .map(s => ({ ...s, avg: s.total / s.count }))
    .sort((a,b) => b.avg - a.avg);
 
  // 3. Calculer nombre de posts/jour selon performances
  const dayCount = {};
  posts.forEach(p => { dayCount[p.jour] = (dayCount[p.jour] || 0) + 1; });
  const avgPostsPerDay = Math.max(1, Math.round(posts.length / 7));
  const postsPerDay = Math.min(avgPostsPerDay, 3);
 
  // 4. Mots-clés qui performent
  const keywordMap = {};
  posts.forEach(p => {
    extractKeywords(p.title).forEach(k => {
      if (!keywordMap[k]) keywordMap[k] = { total: 0, count: 0 };
      keywordMap[k].total += p.score;
      keywordMap[k].count++;
    });
  });
  const topKw = Object.keys(keywordMap)
    .filter(k => keywordMap[k].count >= 2)
    .sort((a,b) => (keywordMap[b].total/keywordMap[b].count) - (keywordMap[a].total/keywordMap[a].count))
    .slice(0, 8);
 
  // 5. Meilleur type de post
  const typeScores = {};
  posts.forEach(p => {
    const t = detectPostType(p.title);
    if (!typeScores[t]) typeScores[t] = { total: 0, count: 0 };
    typeScores[t].total += p.score;
    typeScores[t].count++;
  });
  const bestType = Object.keys(typeScores).sort((a,b) =>
    (typeScores[b].total/typeScores[b].count) - (typeScores[a].total/typeScores[a].count)
  )[0];
 
  // 6. Générer les 7 jours
  const joursOrdre = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const today = new Date();
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
 
  const postTemplates = {
    "Reddit": {
      "Question": (kw) => `**${kw} : vous avez déjà vécu ça ?**\n\nJe me pose cette question depuis un moment et j'aimerais avoir vos retours honnêtes.\n\nDans mon expérience, j'ai observé que [ta situation concrète liée à ${kw}].\n\nMais je veux savoir ce que VOUS pensez vraiment :\n- Vous avez vécu quelque chose de similaire ?\n- Qu'est-ce qui vous a aidé ?\n- Ou au contraire, qu'est-ce qui a aggravé les choses ?\n\nPas de bonne ou mauvaise réponse. Juste des témoignages vrais. 👇`,
      "Storytelling": (kw) => `**Ce que ${kw} m'a vraiment appris — témoignage sans filtre**\n\nJe n'aurais jamais pensé partager ça publiquement.\n\nMais après avoir lu des dizaines de posts sur ce sujet, je réalise que personne ne dit vraiment ce qui se passe.\n\nAlors voilà mon histoire :\n\n[Ta situation de départ]\n\nCe que j'ai fait :\n1. [Action 1]\n2. [Action 2]\n3. [Ce qui a tout changé]\n\nLa leçon que j'en tire : [ta conclusion personnelle]\n\nSi tu passes par là, tu n'es pas seul(e). 💙`,
      "Opinion": (kw) => `**Opinion impopulaire sur ${kw} — je m'attends à du débat**\n\nJe vais dire quelque chose que beaucoup pensent tout bas.\n\n[Ton opinion tranchée en 1-2 phrases percutantes]\n\nVoici pourquoi je pense ça :\n\n❌ Ce qu'on entend partout : [idée reçue 1]\n✅ La réalité selon mon expérience : [vérité]\n\n❌ Ce qu'on entend partout : [idée reçue 2]\n✅ La réalité : [vérité]\n\nJe peux me tromper. Convainquez-moi. 👇`,
    },
    "LinkedIn": {
      "Question": (kw) => `${kw} — j'ai besoin de votre avis honnête.\n\nDepuis [X] temps dans ce secteur, j'observe que ce sujet divise vraiment les professionnels.\n\nMa position : [ta position en 1 phrase claire]\n\nMais je veux comprendre votre réalité :\n→ Comment vous vivez ${kw} au quotidien ?\n→ Qu'est-ce qui fonctionne vraiment ?\n→ Ce que vous changeriez si vous pouviez ?\n\nJe réponds personnellement à chaque commentaire. ✉️\n\n#${kw.replace(/\s+/g,"")} #Professionnel #Partage`,
      "Storytelling": (kw) => `Il y a [X] mois, j'ai vécu quelque chose qui a changé ma façon de voir ${kw}.\n\nJe ne pensais pas en parler publiquement.\n\nMais si ça peut aider une personne dans mon réseau...\n\n[Situation de départ — sois précis et humain]\n\nCe que j'ai appris :\n→ [Leçon 1 — concrète]\n→ [Leçon 2 — actionnable]\n→ [Leçon 3 — surprenante]\n\nLe plus important : [ta conclusion en 1 phrase forte]\n\nQu'est-ce que vous retenez de vos propres expériences ?\n\n#${kw.replace(/\s+/g,"")} #Experience #Leadership`,
      "Opinion": (kw) => `3 vérités sur ${kw} que personne n'ose dire.\n\n(Et pourtant tout le monde le pense)\n\n1️⃣ [Vérité 1 — surprenante mais vraie]\n\n2️⃣ [Vérité 2 — qui dérange un peu]\n\n3️⃣ [Vérité 3 — la plus importante]\n\nJe préfère une conversation honnête à un like poli.\n\nVous êtes d'accord ? Ou je me trompe complètement ? 👇\n\n#${kw.replace(/\s+/g,"")} #OpinionPro #Authenticité`,
    }
  };
 
  let html = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h3 style="margin:0;font-size:16px;">📅 Planning des 7 prochains jours</h3>
        <p style="margin:4px 0 0;font-size:12px;color:var(--text-3);">Basé sur tes ${posts.length} posts · ${postsPerDay} post(s)/jour · Plateformes : ${platforms.slice(0,3).join(", ")}</p>
      </div>
      <button onclick="renderWeeklyPlanner()" style="background:var(--blue-light);color:var(--blue);border:1px solid var(--blue-mid);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--font);">🔄 Regénérer</button>
    </div>`;
 
  window._planningPosts = {};
  let postIdx = 0;
 
  for (let d = 0; d < 7; d++) {
    const dayIdx = (todayIdx + d) % 7;
    const jourNom = joursOrdre[dayIdx];
    const dateObj = new Date(today);
    dateObj.setDate(today.getDate() + d);
    const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
 
    // Meilleurs créneaux pour ce jour
    const daySlots = topSlots
      .filter(s => s.day === jourNom)
      .slice(0, postsPerDay);
 
    // Si pas de créneau connu pour ce jour, prendre les meilleurs globaux
    const slotsToUse = daySlots.length > 0 ? daySlots :
      topSlots.filter(s => !daySlots.includes(s)).slice(0, postsPerDay);
 
    const isToday = d === 0;
    const borderColor = isToday ? "var(--blue)" : "var(--border)";
    const bgColor = isToday ? "var(--blue-light)" : "var(--surface-2)";
 
    html += `
      <div style="border:2px solid ${borderColor};border-radius:var(--radius);margin-bottom:16px;overflow:hidden;">
        <div style="background:${bgColor};padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-weight:700;font-size:14px;text-transform:capitalize;">${dateStr}</span>
            ${isToday ? `<span style="margin-left:8px;background:var(--blue);color:white;font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;">AUJOURD'HUI</span>` : ""}
          </div>
          <span style="font-size:12px;color:var(--text-3);">${slotsToUse.length} publication(s)</span>
        </div>`;
 
    slotsToUse.forEach((slot, si) => {
      const platform = platforms[si % platforms.length] || "Reddit";
      const kw = topKw[postIdx % topKw.length] || "recrutement";
      const types = ["Question", "Storytelling", "Opinion"];
      const postType = types[(postIdx + d + si) % types.length];
      const templateFn = postTemplates[platform]?.[postType] || postTemplates["Reddit"][postType];
      const contenu = templateFn ? templateFn(kw) : `Post sur ${kw} — [Rédige ton contenu ici]`;
      const titre = contenu.split("\n")[0].replace(/\*\*/g,"").trim().substring(0, 60);
 
      window._planningPosts[postIdx] = contenu;
 
      html += `
        <div style="padding:14px 16px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--blue);">🕐 ${slot.hour}h00</span>
              <span style="font-size:11px;background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:20px;">${platform}</span>
              <span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:20px;font-weight:600;">${postType}</span>
              <span style="font-size:11px;background:var(--green-light);color:var(--green);padding:2px 8px;border-radius:20px;">🏷️ ${kw}</span>
              ${slot.avg > 0 ? `<span style="font-size:11px;color:var(--text-3);">Score estimé : ${slot.avg.toFixed(1)}</span>` : ""}
            </div>
          </div>
          <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text);">📌 ${titre}...</div>
          <details>
            <summary style="cursor:pointer;font-size:13px;color:var(--blue);font-weight:600;user-select:none;">✍️ Voir le post complet</summary>
            <div style="margin-top:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8;color:var(--text-2);white-space:pre-wrap;font-family:var(--font);">${contenu.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
            <button onclick="copyPlanningPost(this,${postIdx})" style="margin-top:8px;background:var(--green-light);color:var(--green);border:1px solid var(--green);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--font);font-weight:600;">📋 Copier ce post</button>
          </details>
        </div>`;
      postIdx++;
    });
 
    html += `</div>`;
  }
 
  return html;
}
 
function copyPlanningPost(btn, idx) {
  const content = window._planningPosts?.[idx];
  if (!content) return;
  navigator.clipboard.writeText(content).then(() => {
    btn.textContent = "✅ Copié !";
    setTimeout(() => { btn.textContent = "📋 Copier ce post"; }, 2000);
  });
}
 
/* =====================
   GÉNÉRATEUR DE POST AVEC API REDDIT
===================== */
 
async function fetchRedditInspo(topic) {
  // Recherche globale sur tout Reddit — pas seulement jobsansfiltre
  const attempts = [
    // Recherche globale Reddit sur le sujet (tous subreddits confondus)
    `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=month&limit=15`,
    // Recherche sur 6 mois si pas de résultats ce mois-ci
    `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=year&limit=15`,
  ];
 
  for (const url of attempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const json = await response.json();
      if (!json?.data?.children?.length) continue;
 
      const posts = json.data.children
        .map(c => c.data)
        .filter(p => p.title && !p.stickied && p.score > 10)
        .map(p => ({
          title: p.title,
          score: p.score,
          num_comments: p.num_comments,
          subreddit: p.subreddit,
          created: new Date(p.created_utc * 1000).toLocaleDateString("fr-FR"),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
 
      if (posts.length >= 1) {
        console.log("Reddit OK ✅ :", posts.length, "posts trouvés sur", [...new Set(posts.map(p => p.subreddit))].join(", "));
        return posts;
      }
    } catch(e) {
      console.log("Tentative échouée:", e.message);
      continue;
    }
  }
 
  console.log("Reddit API non disponible — génération locale");
  return null;
}
 
function buildPost1(topic, redditPosts, platform) {
  // FORMAT 1 : Témoignage personnel — inspiré des tendances mais 100% original
  const angles = redditPosts
    ? redditPosts.slice(0,2).map(p => {
        // Extraire l'angle émotionnel sans copier le titre
        const words = p.title.split(" ").filter(w => w.length > 4);
        return words[Math.floor(Math.random() * words.length)] || topic;
      })
    : [topic];
 
  const angle = angles[0] || topic;
  const titre = `Ce que j'ai vraiment vécu avec ${topic} — personne n'en parle`;
 
  const p = (platform || "Reddit").toLowerCase();
  if (p === "linkedin") {
    return {
      titre,
      type: "Témoignage",
      contenu: `${titre}\n\nIl y a [X] mois, j'étais dans une situation que beaucoup connaissent mais peu osent évoquer.\n\nJe me suis retrouvé face à [ta situation personnelle liée à ${topic}].\n\nCe que j'ai ressenti :\n😰 D'abord la panique\n🤔 Puis la réflexion\n💡 Enfin la clarté\n\nLa leçon que j'en tire aujourd'hui :\n→ [Ta leçon 1]\n→ [Ta leçon 2]\n→ [Ta leçon 3]\n\nSi tu traverses quelque chose de similaire, tu n'es pas seul(e).\n\nQu'aurais-tu fait à ma place ?\n\n#${topic.replace(/\s+/g,"")} #Témoignage #Authenticité`,
      inspo: redditPosts ? `Inspiré de ${redditPosts.length} posts viraux sur r/${redditPosts.map(p=>p.subreddit).join(", r/")}` : null
    };
  }
  return {
    titre,
    type: "Témoignage",
    contenu: `**${titre}**\n\nJe vais vous partager quelque chose que je n'ai jamais dit publiquement.\n\nQuand j'ai été confronté à [ta situation liée à ${topic}], j'ai fait une erreur que beaucoup font.\n\n**Ce que j'aurais dû faire :**\n\n1. [Action concrète 1]\n2. [Action concrète 2]\n3. [Ce que j'ai finalement compris]\n\n**Ce que ça m'a appris sur ${topic} :**\n[Ta conclusion personnelle en 2-3 phrases authentiques]\n\nVous avez vécu quelque chose de similaire ? 👇`,
    inspo: redditPosts ? `Inspiré de ${redditPosts.length} posts viraux sur r/${redditPosts.map(p=>p.subreddit).join(", r/")}` : null
  };
}
 
function buildPost2(topic, redditPosts, platform) {
  // FORMAT 2 : Opinion tranchée avec données réelles
  const titre = `${topic} : voici ce que les chiffres disent vraiment (et c'est surprenant)`;
  const topSubreddits = redditPosts ? [...new Set(redditPosts.map(p => p.subreddit))].slice(0,2).join(" et r/") : "";
 
  const p = (platform || "Reddit").toLowerCase();
  if (p === "linkedin") {
    return {
      titre,
      type: "Opinion data-driven",
      contenu: `${titre}\n\nJ'ai passé du temps à analyser ce sujet et ce que j'ai trouvé m'a surpris.\n\n📊 Ce que pensent la majorité :\n[Idée reçue commune sur ${topic}]\n\n❌ Ce que les données montrent vraiment :\n[Ta contre-argumentation basée sur ton expérience]\n\nLes 3 points qui m'ont le plus frappé :\n\n1️⃣ [Point surprenant 1]\n2️⃣ [Point surprenant 2]\n3️⃣ [Point surprenant 3]\n\nConclusion : [Ta position claire et argumentée]\n\nVous en pensez quoi ? Désaccord bienvenu 👇\n\n#${topic.replace(/\s+/g,"")} #Data #Analyse`,
      inspo: redditPosts ? `Basé sur les tendances de r/${topSubreddits}` : null
    };
  }
  return {
    titre,
    type: "Opinion data-driven",
    contenu: `**${titre}**\n\nJ'ai analysé des dizaines de témoignages sur ${topic} et voici ce qui ressort vraiment.\n\n**Ce que tout le monde croit :**\n❌ [Idée reçue 1]\n❌ [Idée reçue 2]\n❌ [Idée reçue 3]\n\n**La réalité selon mon analyse :**\n✅ [Vérité 1 — avec un exemple concret]\n✅ [Vérité 2 — avec un exemple concret]\n✅ [Vérité 3 — avec un exemple concret]\n\n**Ma conclusion :**\n[Ta position tranchée en 2 phrases]\n\nJe suis prêt à défendre chaque point. Lancez-vous 👇`,
    inspo: redditPosts ? `Basé sur les tendances de r/${topSubreddits}` : null
  };
}
 
function buildPost3(topic, redditPosts, platform) {
  // FORMAT 3 : Question ouverte qui invite au débat
  const titre = `Franchement, comment vous gérez ${topic} au quotidien ? Je veux des vraies réponses`;
  const topSubreddits = redditPosts ? [...new Set(redditPosts.map(p => p.subreddit))].slice(0,2).join(" et r/") : "";
 
  const p = (platform || "Reddit").toLowerCase();
  if (p === "linkedin") {
    return {
      titre,
      type: "Question communauté",
      contenu: `${titre}\n\nJe pose la question directement, sans langue de bois.\n\nDepuis que je travaille sur ${topic}, j'entends beaucoup de discours formatés.\n\nMoi je veux savoir ce que vous vivez VRAIMENT :\n\n→ Quel est votre plus grand défi avec ${topic} en ce moment ?\n→ Qu'est-ce qui vous a aidé concrètement ?\n→ Ce que vous auriez aimé savoir au début ?\n\nPas de réponse parfaite ici. Juste des expériences honnêtes.\n\nJe réponds personnellement à chaque commentaire ✉️\n\n#${topic.replace(/\s+/g,"")} #Communauté #Authenticité`,
      inspo: redditPosts ? `Inspiré des discussions sur r/${topSubreddits}` : null
    };
  }
  return {
    titre,
    type: "Question communauté",
    contenu: `**${titre}**\n\nPas de discours. Pas de conseils formatés. Juste une vraie question.\n\nJe vois énormément de posts sur ${topic} mais on tourne souvent autour du pot.\n\n**Ce que je veux vraiment savoir :**\n\n🔸 Votre pire expérience avec ${topic} ?\n🔸 Ce qui vous a VRAIMENT aidé (pas les conseils classiques) ?\n🔸 Ce que vous feriez différemment si vous recommenciez ?\n\nPrenez 2 minutes. Répondez honnêtement.\n\n*(Je lis et réponds à absolument tous les commentaires 👇)*`,
    inspo: redditPosts ? `Inspiré des discussions sur r/${topSubreddits}` : null
  };
}
 
const generateIdeaBtn = document.getElementById("generate-idea-btn");
const ideaLoading = document.getElementById("idea-loading");
const ideaResult = document.getElementById("idea-result");
 
generateIdeaBtn && generateIdeaBtn.addEventListener("click", async () => {
  const topic = document.getElementById("idea-topic").value.trim();
  const platform = document.getElementById("idea-platform")?.value || "Reddit";
  if (!topic) { alert("Entre un sujet."); return; }
 
  ideaLoading.classList.remove("hidden");
  ideaResult.innerHTML = "";
 
  // Chercher l'inspiration Reddit
  const redditPosts = await fetchRedditInspo(topic);
 
  ideaLoading.classList.add("hidden");
  window._postContents = {};
 
  // Générer les 3 posts avec formats vraiment différents
  const posts3 = [
    buildPost1(topic, redditPosts, platform),
    buildPost2(topic, redditPosts, platform),
    buildPost3(topic, redditPosts, platform),
  ];
 
  // Afficher les posts Reddit viraux si trouvés
  let redditInspoHtml = "";
  if (redditPosts && redditPosts.length > 0) {
    const subreddits = [...new Set(redditPosts.map(p => p.subreddit))];
    redditInspoHtml = `
      <div style="background:var(--orange-light);border:1px solid #fed7aa;border-radius:var(--radius);padding:14px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;color:var(--orange);margin-bottom:4px;">🔥 Top posts viraux trouvés sur Reddit</div>
        <div style="font-size:11px;color:var(--orange);margin-bottom:10px;">Sources : ${subreddits.map(s => `r/${s}`).join(", ")}</div>
        ${redditPosts.map(p => `
          <div style="padding:6px 0;border-bottom:1px solid #fed7aa;font-size:12px;">
            <div style="font-weight:600;color:var(--text);margin-bottom:2px;">${p.title}</div>
            <div style="color:var(--text-3);">r/${p.subreddit} · ⬆️ ${p.score} · 💬 ${p.num_comments} · ${p.created}</div>
          </div>`).join("")}
        <p style="font-size:11px;color:var(--orange);margin-top:8px;">✨ Les 3 posts ci-dessous sont 100% originaux, inspirés de ces tendances</p>
      </div>`;
  }
 
  ideaResult.innerHTML = redditInspoHtml + posts3.map((post, idx) => {
    window._postContents[idx] = post.contenu;
    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px;">📌 ${post.titre}</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:20px;font-weight:600;">${post.type}</span>
        <span style="font-size:11px;background:var(--surface);color:var(--text-3);padding:2px 8px;border-radius:20px;border:1px solid var(--border);">${platform}</span>
        ${post.inspo ? `<span style="font-size:11px;background:var(--orange-light);color:var(--orange);padding:2px 8px;border-radius:20px;">🔥 ${post.inspo}</span>` : '<span style="font-size:11px;background:var(--surface-2);color:var(--text-3);padding:2px 8px;border-radius:20px;border:1px solid var(--border);">✨ Généré localement</span>'}
      </div>
      <details style="margin-bottom:10px;">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--blue);user-select:none;">✍️ Voir le post complet</summary>
        <div style="margin-top:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8;color:var(--text-2);white-space:pre-wrap;font-family:var(--font);">${post.contenu.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
        <button onclick="copyPost(this,${idx})" style="margin-top:8px;background:var(--green-light);color:var(--green);border:1px solid var(--green);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--font);font-weight:600;">📋 Copier le post</button>
      </details>
      <button onclick="useIdea('${post.titre.replace(/'/g,"\\'").replace(/"/g,"&quot;")}')" style="background:var(--blue-light);color:var(--blue);border:1px solid var(--blue-mid);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--font);">Analyser ce titre →</button>
    </div>`;
  }).join("");
});
 
function copyPost(btn, idx) {
  const content = window._postContents && window._postContents[idx];
  if (!content) return;
  navigator.clipboard.writeText(content).then(() => {
    btn.textContent = "✅ Copié !";
    setTimeout(() => { btn.textContent = "📋 Copier le post"; }, 2000);
  });
}
 
function useIdea(title) {
  menuItems.forEach(i => i.classList.remove("active"));
  const iaItem = Array.from(menuItems).find(i => i.dataset.section === "ia");
  if (iaItem) { iaItem.classList.add("active"); showSection("ia"); }
  document.getElementById("input-text").value = title;
}
 
/* =====================
   GRAPHIQUES
===================== */
 
function destroyCharts() {
  Object.values(charts).forEach(c => { try { c && c.destroy(); } catch(e) {} });
  charts = {};
}
 
const chartDefaults = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: "#f3f4f6" }, ticks: { font: { family: "'DM Sans'", size: 11 }, color: "#9aa0b0" } },
    y: { grid: { color: "#f3f4f6" }, ticks: { font: { family: "'DM Sans'", size: 11 }, color: "#9aa0b0" } }
  }
};
 
function safeChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return null;
  try { return new Chart(el, config); } catch(e) { console.error("Chart error:", id, e); return null; }
}
 
function renderCharts() {
  if (typeof Chart === "undefined") { setTimeout(() => renderCharts(), 500); return; }
  posts = JSON.parse(localStorage.getItem("posts")) || posts;
  destroyCharts();
  if (posts.length === 0) return;
 
  // Score par jour
  const dayMap = {};
  posts.forEach(p => {
    if (!p.jour) return;
    if (!dayMap[p.jour]) dayMap[p.jour] = { total: 0, count: 0 };
    dayMap[p.jour].total += p.score; dayMap[p.jour].count++;
  });
  const dayLabels = Object.keys(dayMap);
  if (dayLabels.length) {
    charts.day = safeChart("chart-day", {
      type: "bar",
      data: { labels: dayLabels, datasets: [{ data: dayLabels.map(d => +(dayMap[d].total/dayMap[d].count).toFixed(1)), backgroundColor: "#3b82f6", borderRadius: 6 }] },
      options: chartDefaults
    });
  }
 
  // Heures
  const hourMap = {};
  posts.forEach(p => {
    const h = Math.floor(p.heureDecimale || 0);
    if (!hourMap[h]) hourMap[h] = { total: 0, count: 0 };
    hourMap[h].total += p.score; hourMap[h].count++;
  });
  const hourLabels = Object.keys(hourMap).sort((a,b) => a-b);
  if (hourLabels.length) {
    charts.hour = safeChart("chart-hour", {
      type: "bar",
      data: { labels: hourLabels.map(h => h+"h"), datasets: [{ data: hourLabels.map(h => +(hourMap[h].total/hourMap[h].count).toFixed(1)), backgroundColor: "#8b5cf6", borderRadius: 6 }] },
      options: chartDefaults
    });
  }
 
  // Types
  const typeMap = {};
  posts.forEach(p => {
    const t = detectPostType(p.title);
    if (!typeMap[t]) typeMap[t] = { total: 0, count: 0 };
    typeMap[t].total += p.score; typeMap[t].count++;
  });
  const typeLabels = Object.keys(typeMap);
  if (typeLabels.length) {
    charts.type = safeChart("chart-type", {
      type: "doughnut",
      data: { labels: typeLabels, datasets: [{ data: typeLabels.map(t => typeMap[t].count), backgroundColor: ["#3b82f6","#10b981","#8b5cf6","#f97316","#64748b"], borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { display: true, position: "right", labels: { font: { family: "'DM Sans'", size: 11 }, color: "#5a6072" } } } }
    });
  }
 
  // Keywords
  const kwMap = {};
  posts.forEach(p => {
    extractKeywords(p.title).forEach(k => {
      if (!kwMap[k]) kwMap[k] = { total: 0, count: 0 };
      kwMap[k].total += p.score; kwMap[k].count++;
    });
  });
  const kwEntries = Object.keys(kwMap).map(k => ({ k, avg: kwMap[k].total/kwMap[k].count })).sort((a,b) => b.avg-a.avg).slice(0, 7);
  if (kwEntries.length) {
    charts.keyword = safeChart("chart-keyword", {
      type: "bar",
      data: { labels: kwEntries.map(e => e.k), datasets: [{ data: kwEntries.map(e => +e.avg.toFixed(1)), backgroundColor: "#f97316", borderRadius: 6 }] },
      options: { ...chartDefaults, indexAxis: "y" }
    });
  }
 
  // Évolution
  const sorted = [...posts].filter(p => p.date).sort((a,b) => a.date.localeCompare(b.date));
  if (sorted.length) {
    charts.date = safeChart("chart-date", {
      type: "line",
      data: {
        labels: sorted.map(p => p.date),
        datasets: [{ data: sorted.map(p => p.score), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.08)", tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: "#2563eb" }]
      },
      options: chartDefaults
    });
  }
}
 
function renderHomeCharts() {
  if (typeof Chart === "undefined") { setTimeout(() => renderHomeCharts(), 500); return; }
  try { charts.homeLine && charts.homeLine.destroy(); } catch(e) {}
  try { charts.homePlatform && charts.homePlatform.destroy(); } catch(e) {}
  if (posts.length === 0) return;
 
  const sorted = [...posts].filter(p => p.date).sort((a,b) => a.date.localeCompare(b.date));
  charts.homeLine = safeChart("chart-home-line", {
    type: "line",
    data: { labels: sorted.map(p => p.date), datasets: [{ data: sorted.map(p => p.score), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.08)", tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: "#2563eb" }] },
    options: chartDefaults
  });
 
  const platformMap = {};
  posts.forEach(p => { if (!platformMap[p.platform]) platformMap[p.platform] = 0; platformMap[p.platform]++; });
  const pLabels = Object.keys(platformMap);
  charts.homePlatform = safeChart("chart-home-platform", {
    type: "doughnut",
    data: { labels: pLabels, datasets: [{ data: pLabels.map(l => platformMap[l]), backgroundColor: ["#3b82f6","#10b981","#8b5cf6","#f97316","#64748b"], borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { display: true, position: "bottom", labels: { font: { family: "'DM Sans'", size: 11 }, color: "#5a6072" } } } }
  });
}
 
/* =====================
   REFRESH GLOBAL
===================== */
function refreshAll() {
  renderTable();
  renderHomeCharts();
  document.getElementById("global-insights").innerHTML = generateGlobalInsights();
  const statsSection = document.getElementById("section-stats");
  if (statsSection && !statsSection.classList.contains("hidden")) {
    setTimeout(() => renderCharts(), 200);
  }
}
 
/* =====================
   INIT
===================== */
document.addEventListener("DOMContentLoaded", () => {
  posts = JSON.parse(localStorage.getItem("posts")) || [];
  renderTable();
  setTimeout(() => renderHomeCharts(), 100);
  document.getElementById("global-insights").innerHTML = generateGlobalInsights();
 
  // Sync auto au chargement + toutes les 5 min
  setTimeout(() => syncFromSheets(false), 1500);
  setInterval(() => syncFromSheets(false), 5 * 60 * 1000);
});

