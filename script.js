/* =====================
   MOTEUR IA LOCAL AVANCÉ
   Analyse intelligente sans clé API
===================== */
 
/* =====================
   GOOGLE SHEETS SYNC AUTOMATIQUE
===================== */
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzopku3BQfw4wqJYy35K8Tg2jXb8b3_RGFYy0CD5dwEte1EqUzpFOmg9XETgYViXK5Ulg/exec";
 
function showSyncToast(message, isError = false) {
  const existing = document.getElementById("sync-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "sync-toast";
  toast.textContent = message;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${isError?"#dc2626":"#059669"};color:white;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;font-family:var(--font);box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:9999;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
 
function convertSheetRow(row) {
  let dateStr = "";
  if (row["Date publication"]) {
    const raw = String(row["Date publication"]).trim();
    // Format dd/MM/yyyy ou dd/MM/yyyy HH:mm (format français Google Sheets)
    if (raw.match(/^\d{2}\/\d{2}\/\d{4}/)) {
      const parts = raw.split("/");
      const day = parts[0].padStart(2,"0");
      const month = parts[1].padStart(2,"0");
      const year = parts[2].substring(0,4);
      dateStr = `${year}-${month}-${day}`;
    // Format "2026 00:00-MM-dd" (bug Google Sheets mars/mois >12)
    } else if (raw.match(/^\d{4}\s+\d{2}:\d{2}-\d{2}-\d{2}/)) {
      const year = raw.substring(0, 4);
      const rest = raw.split("-");
      const month = rest[1].padStart(2,"0");
      const day = rest[2].substring(0,2).padStart(2,"0");
      dateStr = `${year}-${month}-${day}`;
    // Format yyyy-dd-MM (Google Sheets inverse parfois)
    } else if (raw.match(/^\d{4}-\d{2}-\d{2}/)) {
      const parts = raw.substring(0,10).split("-");
      const year = parts[0];
      const second = parts[1];
      const third = parts[2];
      // Si le "mois" dépasse 12, c'est en réalité le jour
      if (parseInt(second) > 12) {
        dateStr = `${year}-${third}-${second}`;
      } else {
        dateStr = `${year}-${second}-${third}`;
      }
    }
  }
 
  let timeStr = "09:00";
  if (row["Heure"]) {
    const raw = String(row["Heure"]).trim();
    if (raw.match(/^\d{1,2}:\d{2}/)) {
      timeStr = raw.substring(0, 5).padStart(5, "0");
    } else if (raw.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)) {
      timeStr = raw.split(" ")[1].substring(0, 5);
    }
  }
 
  const likes    = Number(row["Likes"]) || 0;
  const comments = Number(row["Commentaires"]) || 0;
  const views    = Number(row["Vues"]) || 0;
  const engagement = likes + comments;
  const score = views > 0 ? Math.round((engagement / views) * 10000) / 10 : 0;
 
  let jour = String(row["Jour (auto)"] || "").trim();
  if (!jour && dateStr) {
    jour = new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long" });
  }
 
  const timeParts = timeStr.split(":");
  const heureDecimale = Number(timeParts[0]) + Number(timeParts[1] || 0) / 60;
 
  return {
    platform: row["Plateforme"] || "Reddit",
    date: dateStr,
    time: timeStr,
    author: String(row["Auteur"] || ""),
    title: String(row["Titre"] || ""),
    likes, comments, views, engagement, jour, score, heureDecimale,
    fromSheets: true
  };
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
 
    const sheetPosts = json.data
      .map(convertSheetRow)
      .filter(p => p.title && p.title.length > 2);
 
    const manualPosts = posts.filter(p => !p.fromSheets);
    posts = [...sheetPosts, ...manualPosts];
    savePosts();
    renderTable();
    renderHomeCharts();
 
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (syncStatus) {
      syncStatus.textContent = `✓ ${sheetPosts.length} posts · ${now}`;
      syncStatus.style.color = "#4ade80";
    }
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `🔄 Synchroniser`;
    }
    if (showFeedback) showSyncToast(`✅ ${sheetPosts.length} posts synchronisés !`);
 
  } catch (err) {
    console.error("Sync error:", err);
    if (syncStatus) {
      syncStatus.textContent = "❌ Erreur sync";
      syncStatus.style.color = "#f87171";
    }
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `🔄 Synchroniser`;
    }
    if (showFeedback) showSyncToast("❌ Erreur de connexion", true);
  }
}
 
// Sync au chargement + toutes les 5 minutes
window.addEventListener("load", () => {
  setTimeout(() => syncFromSheets(false), 800);
  setInterval(() => syncFromSheets(false), 5 * 60 * 1000);
});
 
// Bouton manuel
document.addEventListener("DOMContentLoaded", () => {
  const syncBtn = document.getElementById("sync-btn");
  if (syncBtn) syncBtn.addEventListener("click", () => syncFromSheets(true));
});
 
/* =====================
   DATE D'ACCUEIL
===================== */
const dateEl = document.getElementById("current-date");
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
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
  hideAllSections();
  if (sections[key]) sections[key].classList.remove("hidden");
  if (key === "stats") setTimeout(() => renderCharts(), 100);
  if (key === "accueil") setTimeout(() => renderHomeCharts(), 100);
  if (key === "planning") renderPlanning();
  if (key === "general") {
    document.getElementById("global-insights").innerHTML = generateGlobalInsights();
  }
}
 
menuItems.forEach(item => {
  item.addEventListener("click", () => {
    menuItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const key = item.dataset.section;
    showSection(key);
  });
});
 
/* =====================
   STOCKAGE
===================== */
let posts = JSON.parse(localStorage.getItem("posts")) || [];
 
function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}
 
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
  const stopwords = ["pour", "dans", "avec", "cette", "sans", "mais", "plus", "très", "tout", "aussi", "bien", "après", "même"];
  return title
    .toLowerCase()
    .replace(/[.,!?…:;«»"'()]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.includes(w));
}
 
function getBestDayStats() {
  if (posts.length < 2) return null;
  const byDay = {};
  posts.forEach(p => {
    if (!byDay[p.jour]) byDay[p.jour] = { totalScore: 0, count: 0 };
    byDay[p.jour].totalScore += p.score;
    byDay[p.jour].count++;
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
    const h = Math.floor(p.heureDecimale);
    if (!byHour[h]) byHour[h] = { totalScore: 0, count: 0 };
    byHour[h].totalScore += p.score;
    byHour[h].count++;
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
  const avg = similar.reduce((a, b) => a + b.score, 0) / similar.length;
  return { count: similar.length, avgScore: avg };
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
    document.getElementById("global-insights").innerHTML = generateGlobalInsights();
    return;
  }
 
  emptyState && emptyState.classList.add("hidden");
 
  posts.forEach((post, index) => {
    const row = document.createElement("tr");
    const scoreClass = post.score > 2 ? "high" : post.score > 1 ? "mid" : "low";
 
    row.innerHTML = `
      <td>${post.platform}</td>
      <td>${post.date}</td>
      <td>${post.time}</td>
      <td>${post.author}</td>
      <td title="${post.title}">${post.title}</td>
      <td>${post.likes}</td>
      <td>${post.comments}</td>
      <td>${post.views.toLocaleString("fr-FR")}</td>
      <td><span class="score-badge ${scoreClass}">${post.score}</span></td>
      <td>
        <div class="action-btns">
          <button class="edit-btn" data-index="${index}">Modifier</button>
          <button class="delete-btn" data-index="${index}">Supprimer</button>
          <button class="analyze-btn" data-index="${index}">IA ✦</button>
        </div>
      </td>
    `;
    dataBody.appendChild(row);
  });
 
  updateStats();
  document.getElementById("global-insights").innerHTML = generateGlobalInsights();
}
 
renderTable();
 
/* =====================
   AJOUT / MODIFICATION
===================== */
const addPostBtn = document.getElementById("add-post");
const cancelEditBtn = document.getElementById("cancel-edit");
const formTitle = document.getElementById("form-title");
let editIndex = null;
 
function clearForm() {
  ["post-platform","post-date","post-time","post-author","post-title","post-likes","post-comments","post-views"]
    .forEach(id => {
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
 
  if (!platform || !date || !time || !author || !title) {
    alert("Merci de remplir tous les champs obligatoires.");
    return;
  }
 
  const engagement = likes + comments;
  const jour = new Date(date).toLocaleDateString("fr-FR", { weekday: "long" });
  const score = views > 0 ? Math.round((engagement / views) * 10000) / 10 : 0;
  const heureDecimale = Number(time.split(":")[0]) + Number(time.split(":")[1]) / 60;
 
  const newPost = { platform, date, time, author, title, likes, comments, views, engagement, jour, score, heureDecimale };
 
  if (editIndex === null) {
    posts.push(newPost);
  } else {
    posts[editIndex] = newPost;
    exitEditMode();
  }
 
  savePosts();
  renderTable();
  clearForm();
});
 
cancelEditBtn && cancelEditBtn.addEventListener("click", () => {
  exitEditMode();
  clearForm();
});
 
function exitEditMode() {
  editIndex = null;
  addPostBtn.textContent = "Ajouter";
  formTitle.textContent = "Ajouter un post";
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
    savePosts();
    renderTable();
    return;
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
 
    // Naviguer vers Données
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
 
  const success = (posts.filter(p => p.score > 1.5).length / posts.length) * 100;
  document.getElementById("success-rate").textContent = success.toFixed(1) + "%";
 
  const dayStats = getBestDayStats();
  document.getElementById("best-day-home").textContent = dayStats ? dayStats.bestDay : "—";
}
 
/* =====================
   EXPORT CSV
===================== */
function exportCSV() {
  if (posts.length === 0) { alert("Aucune donnée à exporter."); return; }
 
  const headers = ["Plateforme","Date","Heure","Auteur","Titre","Likes","Commentaires","Vues","Engagement","Jour","Score","Heure décimale"];
  const rows = posts.map(p => [
    p.platform, p.date, p.time, p.author,
    `"${p.title.replace(/"/g, '""')}"`,
    p.likes, p.comments, p.views, p.engagement, p.jour, p.score, p.heureDecimale
  ].join(","));
 
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jobsansfiltre_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
 
document.getElementById("export-csv").addEventListener("click", exportCSV);
const exportBtn2 = document.getElementById("export-csv-2");
if (exportBtn2) exportBtn2.addEventListener("click", exportCSV);
 
/* =====================
   ANALYSE IA — MOTEUR LOCAL INTELLIGENT
===================== */
const analyzeBtn = document.getElementById("analyze-btn");
const analyzeLocalBtn = document.getElementById("analyze-local-btn");
const aiResult = document.getElementById("ai-result");
const inputText = document.getElementById("input-text");
const aiLoading = document.getElementById("ai-loading");
 
// Base de règles Reddit recrutement
const SIGNALS_POSITIFS = {
  question: ["?", "selon vous", "votre avis", "vous pensez", "est-ce que"],
  emotion: ["incroyable", "choqué", "honte", "fier", "déprimé", "épuisé", "fou", "absurde", "scandale"],
  storytelling: ["j'ai vécu", "mon histoire", "mon expérience", "hier", "aujourd'hui", "la semaine", "j'ai été", "j'ai reçu", "j'ai quitté", "j'ai décroché"],
  chiffres: [/\d+\s*(ans?|mois|semaines?|jours?|postes?|€|k€|entretiens?)/, /\d+\s*%/, /\d+\s*(candidatures?|refus|offres?)/],
  polémique: ["personne ne dit", "vérité", "sans filtre", "réalité", "mensonge", "mythe", "arnaque", "injuste", "discrimination"],
  conseil: ["comment", "astuce", "conseil", "guide", "méthode", "stratégie", "technique"],
  longueur_ideale: (t) => t.length >= 40 && t.length <= 100,
};
 
const SIGNAUX_NEGATIFS = {
  trop_court: (t) => t.length < 15,
  trop_long: (t) => t.length > 130,
  generique: ["post", "question", "aide", "bonjour", "salut", "help"],
  majuscules_exces: (t) => (t.match(/[A-Z]/g) || []).length > t.length * 0.4,
};
 
const TEMPLATES_TITRES = [
  (kw, type) => `Pourquoi ${kw} est le vrai problème du recrutement en France`,
  (kw, type) => `J'ai vécu ça : ${kw} et ce que j'ai appris`,
  (kw, type) => `${kw} : ce que les RH ne vous diront jamais`,
  (kw, type) => `La vérité sur ${kw} (témoignage sans filtre)`,
  (kw, type) => `Comment j'ai géré ${kw} et ce que ça m'a appris`,
  (kw, type) => `${kw} en 2024 : mon retour d'expérience honnête`,
];
 
const CONSEILS_PAR_TYPE = {
  "Question": "Les questions directes génèrent 40% plus de commentaires. Assure-toi que ta question est ouverte et invite au débat.",
  "Storytelling": "Les posts storytelling ont le meilleur taux de lecture complet. Commence par l'élément le plus émotionnel.",
  "Opinion": "Les opinions tranchées divisent et engagent. N'aie pas peur de prendre position clairement.",
  "Conseil": "Les posts conseils fonctionnent mieux avec un résultat concret dans le titre (ex: 'Comment j'ai obtenu 3 offres en 2 semaines').",
  "Post mixte": "Choisis un angle dominant : question, récit ou conseil. Un titre trop mixte perd l'attention.",
};
 
function analyserTitreavancé(titre) {
  const t = titre.toLowerCase();
  const mots = extractKeywords(titre);
  let score = 3.0; // score de base
  const pointsForts = [];
  const pointsFaibles = [];
 
  // Longueur
  if (SIGNALS_POSITIFS.longueur_ideale(titre)) {
    score += 1.2; pointsForts.push("Longueur idéale (entre 40 et 100 caractères)");
  } else if (SIGNAUX_NEGATIFS.trop_court(titre)) {
    score -= 1.5; pointsFaibles.push("Titre trop court — manque de contexte");
  } else if (SIGNAUX_NEGATIFS.trop_long(titre)) {
    score -= 0.8; pointsFaibles.push("Titre trop long — risque d'être tronqué sur mobile");
  }
 
  // Signaux positifs textuels
  if (SIGNALS_POSITIFS.question.some(s => t.includes(s))) {
    score += 1.0; pointsForts.push("Format question → favorise les commentaires");
  }
  if (SIGNALS_POSITIFS.emotion.some(s => t.includes(s))) {
    score += 1.3; pointsForts.push("Mot émotionnel détecté → fort impact sur le clic");
  }
  if (SIGNALS_POSITIFS.storytelling.some(s => t.includes(s))) {
    score += 1.1; pointsForts.push("Angle storytelling → très performant sur Reddit");
  }
  if (SIGNALS_POSITIFS.chiffres.some(r => r instanceof RegExp ? r.test(t) : t.includes(r))) {
    score += 0.9; pointsForts.push("Chiffre concret → crédibilité et curiosité");
  }
  if (SIGNALS_POSITIFS.polémique.some(s => t.includes(s))) {
    score += 1.2; pointsForts.push("Ton polémique / sans filtre → très viral sur r/jobsansfiltre");
  }
  if (SIGNALS_POSITIFS.conseil.some(s => t.includes(s))) {
    score += 0.7; pointsForts.push("Format conseil → bon taux de sauvegarde");
  }
 
  // Signaux négatifs
  if (SIGNAUX_NEGATIFS.generique.some(s => t === s || t.startsWith(s + " "))) {
    score -= 1.0; pointsFaibles.push("Début de titre trop générique");
  }
  if (SIGNAUX_NEGATIFS.majuscules_exces(titre)) {
    score -= 0.8; pointsFaibles.push("Trop de majuscules — perçu comme du spam");
  }
  if (mots.length < 2) {
    pointsFaibles.push("Peu de mots-clés forts — enrichis le sujet");
  }
 
  // Bonus posts similaires
  const sim = getSimilarPostsScore(mots);
  if (sim && sim.count >= 2) {
    const bonus = Math.min(sim.avgScore * 0.3, 1.5);
    score += bonus;
    pointsForts.push(`${sim.count} posts similaires dans ta base avec un score moyen de ${sim.avgScore.toFixed(1)}`);
  }
 
  // Plafonner entre 0 et 10
  score = Math.min(10, Math.max(0, score));
 
  const potentiel = score >= 6.5 ? "Élevé" : score >= 4 ? "Moyen" : "Faible";
 
  // Générer des titres alternatifs
  const motCle = mots[0] || "recrutement";
  const type = detectPostType(titre);
  const alts = TEMPLATES_TITRES
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(fn => fn(motCle, type));
 
  // Conseil selon type
  const conseil = CONSEILS_PAR_TYPE[type] || CONSEILS_PAR_TYPE["Post mixte"];
 
  // Meilleur moment basé sur les données réelles
  const bestDay = getBestDayStats();
  const bestHour = getBestHourStats();
  const momentConseil = bestDay && bestHour
    ? `D'après tes données, publie le ${bestDay.bestDay} vers ${bestHour.bestHour}h pour maximiser la visibilité.`
    : "Publie en semaine entre 12h et 14h ou le soir vers 20h-22h (heures de pointe Reddit France).";
 
  return {
    type,
    score_estime: Math.round(score * 10) / 10,
    potentiel,
    points_forts: pointsForts.length ? pointsForts : ["Structure correcte"],
    points_faibles: pointsFaibles.length ? pointsFaibles : ["Rien de bloquant détecté"],
    titres_alternatifs: alts,
    mots_cles: mots.slice(0, 5),
    meilleur_moment: momentConseil,
    conseil_global: conseil,
  };
}
 
function runAIAnalysis(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) { alert("Colle un titre à analyser."); return; }
 
  aiResult.innerHTML = "";
  aiLoading.classList.remove("hidden");
 
  // Simuler un court délai pour l'effet "analyse en cours"
  setTimeout(() => {
    const data = analyserTitreavancé(cleanTitle);
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
        <div style="font-size:22px; font-weight:700; color:var(--text); margin-bottom:8px;">${data.type}</div>
        <div style="display:inline-block; background:${potentielBg}; border:1px solid ${potentielColor}; padding:4px 14px; border-radius:20px; font-size:13px; font-weight:700; color:${potentielColor};">
          Potentiel ${data.potentiel}
        </div>
      </div>
 
      <div class="ai-card">
        <h3>Score estimé</h3>
        <div class="score-big" style="color:${potentielColor}">${data.score_estime}</div>
        <div style="font-size:12px; color:var(--text-3); margin-top:4px;">sur 10</div>
        <div style="margin-top:10px; height:6px; background:var(--border); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${data.score_estime * 10}%; background:${potentielColor}; border-radius:3px; transition:width 1s ease;"></div>
        </div>
      </div>
 
      <div class="ai-card">
        <h3>✅ Points forts</h3>
        <ul>${data.points_forts.map(p => `<li>${p}</li>`).join("")}</ul>
      </div>
 
      <div class="ai-card">
        <h3>⚠️ Points à améliorer</h3>
        <ul>${data.points_faibles.map(p => `<li>${p}</li>`).join("")}</ul>
      </div>
 
      <div class="ai-card">
        <h3>🏷️ Mots-clés détectés</h3>
        <div class="tag-list">${data.mots_cles.length ? data.mots_cles.map(k => `<span class="tag">${k}</span>`).join("") : "<span style='color:var(--text-3);font-size:13px;'>Aucun mot-clé fort détecté</span>"}</div>
      </div>
 
      <div class="ai-card">
        <h3>⏰ Meilleur moment</h3>
        <p>${data.meilleur_moment}</p>
      </div>
 
      <div class="ai-card wide">
        <h3>📝 Titres alternatifs <span style="font-weight:400; color:var(--text-3); font-size:11px;">(clique pour copier)</span></h3>
        ${data.titres_alternatifs.map(t => `<div class="alt-title" onclick="copyTitle(this, '${t.replace(/'/g, "\\'")}')">📋 ${t}</div>`).join("")}
      </div>
 
      <div class="ai-card wide">
        <h3>🧠 Conseil expert</h3>
        <p>${data.conseil_global}</p>
      </div>
    </div>
  `;
}
 
function copyTitle(el, title) {
  navigator.clipboard.writeText(title).then(() => {
    const orig = el.innerHTML;
    el.innerHTML = "✅ Copié !";
    el.style.borderColor = "var(--green)";
    el.style.color = "var(--green)";
    setTimeout(() => { el.innerHTML = orig; el.style.borderColor = ""; el.style.color = ""; }, 1500);
  });
}
 
analyzeBtn.addEventListener("click", () => runAIAnalysis(inputText.value));
analyzeLocalBtn.addEventListener("click", () => runAIAnalysis(inputText.value));
 
/* =====================
   ANALYSE GÉNÉRALE
===================== */
function generateGlobalInsights() {
  if (posts.length === 0) {
    return `<div class="ai-card"><p style="color:var(--text-3)">Aucune donnée disponible. Commence par ajouter des posts dans l'onglet <strong>Données</strong>.</p></div>`;
  }
 
  const typeScores = {};
  posts.forEach(p => {
    const type = detectPostType(p.title);
    if (!typeScores[type]) typeScores[type] = { total: 0, count: 0 };
    typeScores[type].total += p.score;
    typeScores[type].count++;
  });
 
  const keywordScores = {};
  posts.forEach(p => {
    extractKeywords(p.title).forEach(k => {
      if (!keywordScores[k]) keywordScores[k] = { total: 0, count: 0 };
      keywordScores[k].total += p.score;
      keywordScores[k].count++;
    });
  });
 
  const sortedKeywords = Object.keys(keywordScores)
    .sort((a,b) => (keywordScores[b].total/keywordScores[b].count) - (keywordScores[a].total/keywordScores[a].count))
    .slice(0, 5);
 
  const dayStats = getBestDayStats();
  const hourStats = getBestHourStats();
 
  const bestType = Object.keys(typeScores).sort((a,b) =>
    (typeScores[b].total/typeScores[b].count) - (typeScores[a].total/typeScores[a].count)
  )[0];
 
  const platformMap = {};
  posts.forEach(p => {
    if (!platformMap[p.platform]) platformMap[p.platform] = 0;
    platformMap[p.platform]++;
  });
 
  return `
    <div class="insights-grid">
      <div class="ai-card">
        <h3>📊 Performance par type</h3>
        ${Object.keys(typeScores).map(t => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
            <span style="font-size:14px;">${t}</span>
            <span style="font-family:var(--font-mono); font-weight:700; color:var(--blue);">${(typeScores[t].total/typeScores[t].count).toFixed(1)}</span>
          </div>
        `).join("")}
      </div>
 
      <div class="ai-card">
        <h3>🏷️ Mots-clés les plus efficaces</h3>
        <div class="tag-list" style="margin-bottom:8px;">
          ${sortedKeywords.map(k => `<span class="tag">${k}</span>`).join("")}
        </div>
        ${sortedKeywords.map(k => `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px;">
            <span style="color:var(--text-2);">${k}</span>
            <span style="font-family:var(--font-mono); font-weight:600; color:var(--blue);">${(keywordScores[k].total/keywordScores[k].count).toFixed(1)}</span>
          </div>
        `).join("")}
      </div>
 
      <div class="ai-card">
        <h3>📅 Meilleur jour</h3>
        <div style="font-size:24px; font-weight:700; color:var(--text); margin-bottom:4px;">${dayStats ? dayStats.bestDay : "—"}</div>
        <div style="font-size:13px; color:var(--text-3);">Score moyen : <strong>${dayStats ? dayStats.bestAvg.toFixed(1) : "—"}</strong></div>
      </div>
 
      <div class="ai-card">
        <h3>⏰ Meilleure heure</h3>
        <div style="font-size:24px; font-weight:700; color:var(--text); font-family:var(--font-mono); margin-bottom:4px;">${hourStats ? hourStats.bestHour + "h" : "—"}</div>
        <div style="font-size:13px; color:var(--text-3);">Score moyen : <strong>${hourStats ? hourStats.bestAvg.toFixed(1) : "—"}</strong></div>
      </div>
 
      <div class="ai-card" style="grid-column:span 2;">
        <h3>🧠 Synthèse</h3>
        <p style="font-size:15px; line-height:1.7;">
          Tes posts de type <strong>${bestType}</strong> sont les plus performants.
          Publie de préférence le <strong>${dayStats ? dayStats.bestDay : "?"}</strong> vers <strong>${hourStats ? hourStats.bestHour + "h" : "?"}</strong> pour maximiser l'engagement.
          ${sortedKeywords.length ? `Les mots-clés <strong>${sortedKeywords.slice(0,2).join("</strong> et <strong>")}</strong> génèrent les meilleurs scores.` : ""}
        </p>
      </div>
    </div>
  `;
}
 
document.getElementById("global-insights").innerHTML = generateGlobalInsights();
 
/* =====================
   PLANNING
===================== */
function renderPlanning() {
  const slotsEl = document.getElementById("best-slots");
  if (!slotsEl) return;
 
  if (posts.length < 3) {
    slotsEl.innerHTML = `<p style="color:var(--text-3); font-size:14px;">Ajoute au moins 3 posts pour voir tes meilleurs créneaux.</p>`;
    return;
  }
 
  // Calculer score moyen par jour + heure
  const slotMap = {};
  posts.forEach(p => {
    const key = `${p.jour}|${Math.floor(p.heureDecimale)}`;
    if (!slotMap[key]) slotMap[key] = { day: p.jour, hour: Math.floor(p.heureDecimale), total: 0, count: 0 };
    slotMap[key].total += p.score;
    slotMap[key].count++;
  });
 
  const slots = Object.values(slotMap)
    .map(s => ({ ...s, avg: s.total / s.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
 
  slotsEl.innerHTML = slots.map((s, i) => `
    <div class="slot-item">
      <span class="slot-day">${i === 0 ? "🥇 " : i === 1 ? "🥈 " : ""}${s.day}</span>
      <span class="slot-hour">${s.hour}h–${s.hour+1}h</span>
      <span class="slot-score">${s.avg.toFixed(1)}</span>
    </div>
  `).join("");
}
 
/* =====================
   GÉNÉRATION D'IDÉES — MOTEUR LOCAL
===================== */
const generateIdeaBtn = document.getElementById("generate-idea-btn");
const ideaLoading = document.getElementById("idea-loading");
const ideaResult = document.getElementById("idea-result");
 
const IDEES_TEMPLATES = [
  {
    type: "Storytelling",
    fn: (topic) => `Le jour où ${topic} a changé ma vision du recrutement`,
    angle: "Raconter un moment précis et personnel lié au sujet",
    pourquoi: "Le storytelling génère 2x plus de commentaires sur Reddit"
  },
  {
    type: "Opinion",
    fn: (topic) => `La vérité que personne ne dit sur ${topic} en France`,
    angle: "Prendre une position tranchée et défendre un point de vue",
    pourquoi: "Les titres 'vérité cachée' créent une forte curiosité"
  },
  {
    type: "Question",
    fn: (topic) => `${topic} : vous avez vraiment vécu ça vous aussi ?`,
    angle: "Inviter la communauté à partager ses propres expériences",
    pourquoi: "Les questions personnelles explosent en commentaires"
  },
  {
    type: "Conseil",
    fn: (topic) => `Comment j'ai géré ${topic} (et ce que j'aurais dû faire)`,
    angle: "Partager un retour d'expérience avec une leçon concrète",
    pourquoi: "Le format 'ce que j'aurais dû faire' est très partageable"
  },
  {
    type: "Opinion",
    fn: (topic) => `${topic} en 2024 : le système est cassé et voilà pourquoi`,
    angle: "Dénoncer un dysfonctionnement avec des arguments concrets",
    pourquoi: "Les posts 'système cassé' génèrent beaucoup d'upvotes sur r/jobsansfiltre"
  },
  {
    type: "Storytelling",
    fn: (topic) => `J'ai testé ${topic} pendant 30 jours — voici ce qui s'est passé`,
    angle: "Expérience personnelle avec une durée définie et un résultat",
    pourquoi: "Le format 'j'ai testé X jours' donne une crédibilité immédiate"
  },
];
 
generateIdeaBtn && generateIdeaBtn.addEventListener("click", () => {
  const topic = document.getElementById("idea-topic").value.trim();
  if (!topic) { alert("Entre un sujet ou thème."); return; }
 
  ideaLoading.classList.remove("hidden");
  ideaResult.innerHTML = "";
 
  setTimeout(() => {
    ideaLoading.classList.add("hidden");
 
    // Prendre 3 templates aléatoires différents
    const shuffled = [...IDEES_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 3);
 
    ideaResult.innerHTML = shuffled.map(tpl => {
      const titre = tpl.fn(topic);
      return `
        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius); padding:14px; margin-bottom:10px;">
          <div style="font-weight:700; font-size:14px; color:var(--text); margin-bottom:6px;">📌 ${titre}</div>
          <div style="font-size:12px; color:var(--blue); font-weight:600; margin-bottom:4px;">${tpl.type}</div>
          <div style="font-size:13px; color:var(--text-2); margin-bottom:4px;">💡 ${tpl.angle}</div>
          <div style="font-size:12px; color:var(--green);">✓ ${tpl.pourquoi}</div>
          <button onclick="useIdea('${titre.replace(/'/g, "\\'")}')" style="margin-top:10px; background:var(--blue-light); color:var(--blue); border:1px solid var(--blue-mid); padding:5px 12px; border-radius:6px; font-size:12px; cursor:pointer; font-family:var(--font);">Analyser ce titre →</button>
        </div>
      `;
    }).join("");
  }, 500);
});
 
function useIdea(title) {
  menuItems.forEach(i => i.classList.remove("active"));
  const iaItem = Array.from(menuItems).find(i => i.dataset.section === "ia");
  if (iaItem) { iaItem.classList.add("active"); showSection("ia"); }
  document.getElementById("input-text").value = title;
}
 
/* =====================
   GRAPHIQUES
===================== */
let charts = {};
 
function destroyCharts() {
  Object.values(charts).forEach(c => c && c.destroy());
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
 
function renderCharts() {
  // Recharger les posts depuis localStorage au cas où la sync vient de se faire
  posts = JSON.parse(localStorage.getItem("posts")) || posts;
  destroyCharts();
  if (posts.length === 0) {
    document.querySelectorAll(".chart-card canvas").forEach(c => {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
    });
    return;
  }
 
  // Score par jour
  const dayMap = {};
  posts.forEach(p => {
    if (!dayMap[p.jour]) dayMap[p.jour] = { total: 0, count: 0 };
    dayMap[p.jour].total += p.score; dayMap[p.jour].count++;
  });
  const dayLabels = Object.keys(dayMap);
  charts.day = new Chart(document.getElementById("chart-day"), {
    type: "bar",
    data: { labels: dayLabels, datasets: [{ data: dayLabels.map(d => dayMap[d].total/dayMap[d].count), backgroundColor: "#3b82f6", borderRadius: 6 }] },
    options: chartDefaults
  });
 
  // Heures
  const hourMap = {};
  posts.forEach(p => {
    const h = Math.floor(p.heureDecimale);
    if (!hourMap[h]) hourMap[h] = { total: 0, count: 0 };
    hourMap[h].total += p.score; hourMap[h].count++;
  });
  const hourLabels = Object.keys(hourMap).sort((a,b) => a-b);
  charts.hour = new Chart(document.getElementById("chart-hour"), {
    type: "bar",
    data: { labels: hourLabels.map(h => h+"h"), datasets: [{ data: hourLabels.map(h => hourMap[h].total/hourMap[h].count), backgroundColor: "#8b5cf6", borderRadius: 6 }] },
    options: chartDefaults
  });
 
  // Types
  const typeMap = {};
  posts.forEach(p => {
    const t = detectPostType(p.title);
    if (!typeMap[t]) typeMap[t] = { total: 0, count: 0 };
    typeMap[t].total += p.score; typeMap[t].count++;
  });
  const typeLabels = Object.keys(typeMap);
  charts.type = new Chart(document.getElementById("chart-type"), {
    type: "doughnut",
    data: {
      labels: typeLabels,
      datasets: [{ data: typeLabels.map(t => typeMap[t].count), backgroundColor: ["#3b82f6","#10b981","#8b5cf6","#f97316","#64748b"], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { display: true, position: "right", labels: { font: { family: "'DM Sans'", size: 11 }, color: "#5a6072" } } } }
  });
 
  // Keywords
  const kwMap = {};
  posts.forEach(p => {
    extractKeywords(p.title).forEach(k => {
      if (!kwMap[k]) kwMap[k] = { total: 0, count: 0 };
      kwMap[k].total += p.score; kwMap[k].count++;
    });
  });
  const kwEntries = Object.keys(kwMap).map(k => ({ k, avg: kwMap[k].total/kwMap[k].count })).sort((a,b) => b.avg-a.avg).slice(0, 7);
  charts.keyword = new Chart(document.getElementById("chart-keyword"), {
    type: "bar",
    data: { labels: kwEntries.map(e => e.k), datasets: [{ data: kwEntries.map(e => e.avg), backgroundColor: "#f97316", borderRadius: 6 }] },
    options: { ...chartDefaults, indexAxis: "y" }
  });
 
  // Évolution
  const sorted = [...posts].sort((a,b) => a.date.localeCompare(b.date));
  charts.date = new Chart(document.getElementById("chart-date"), {
    type: "line",
    data: {
      labels: sorted.map(p => p.date),
      datasets: [{
        data: sorted.map(p => p.score),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.08)",
        tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: "#2563eb"
      }]
    },
    options: chartDefaults
  });
}
 
function renderHomeCharts() {
  if (charts.homeLine) { charts.homeLine.destroy(); }
  if (charts.homePlatform) { charts.homePlatform.destroy(); }
 
  if (posts.length === 0) return;
 
  const sorted = [...posts].sort((a,b) => a.date.localeCompare(b.date));
  charts.homeLine = new Chart(document.getElementById("chart-home-line"), {
    type: "line",
    data: {
      labels: sorted.map(p => p.date),
      datasets: [{
        data: sorted.map(p => p.score),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.08)",
        tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: "#2563eb"
      }]
    },
    options: chartDefaults
  });
 
  const platformMap = {};
  posts.forEach(p => { if (!platformMap[p.platform]) platformMap[p.platform] = 0; platformMap[p.platform]++; });
  const pLabels = Object.keys(platformMap);
  charts.homePlatform = new Chart(document.getElementById("chart-home-platform"), {
    type: "doughnut",
    data: {
      labels: pLabels,
      datasets: [{ data: pLabels.map(l => platformMap[l]), backgroundColor: ["#3b82f6","#10b981","#8b5cf6","#f97316","#64748b"], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { display: true, position: "bottom", labels: { font: { family: "'DM Sans'", size: 11 }, color: "#5a6072" } } } }
  });
}
 
// Init
renderHomeCharts();
