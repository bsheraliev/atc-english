/* ===========================================================================
   ATC English Game — игровая логика
   =========================================================================== */
"use strict";

/* ---------- Состояние и сохранение ---------- */
const SAVE_KEY = "atc_eng_game_v1";
const state = loadState();

function defaultState() {
  return {
    xp: 0,
    best: 0,
    totalCorrect: 0,
    phrasCorrect: 0,
    streakBest: 0,
    achievements: {},
    dialoguesDone: false,
    alphabetPerfect: false,
    soundOn: true,
    mistakes: {},                                   // {вопрос: cat} — на работу над ошибками
    catStats: {},                                   // {cat: {correct, total}}
    daily: { day: "", streak: 0, count: 0, goal: 20 }, // дневная цель и стрик по дням
    voiceURI: "",                                   // выбранный голос диктора
    role: "controller",                             // трек: controller | pilot | cabin
    lang: "ru",                                     // язык интерфейса: ru | tg | en
    org: ""                                         // организация/аэропорт (для командного лидерборда)
  };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return Object.assign(defaultState(), s || {});
  } catch (e) { return defaultState(); }
}
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (inTelegram) { try { TG.CloudStorage.setItem(SAVE_KEY, JSON.stringify(state), () => {}); } catch (e) {} }
}

/* ---------- Прогресс: дневная цель, статистика, ошибки ---------- */
function todayStr() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function markDaily() {
  const t = todayStr();
  if (state.daily.day !== t) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ystr = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
    state.daily.streak = (state.daily.day === ystr) ? (state.daily.streak + 1) : 1;
    state.daily.day = t;
    state.daily.count = 0;
  }
  state.daily.count++;
  save();
}
function recordQuiz(q, correct) {
  const c = q.cat || "other";
  if (!state.catStats[c]) state.catStats[c] = { correct: 0, total: 0 };
  state.catStats[c].total++;
  if (correct) state.catStats[c].correct++;
  if (correct) { if (state.mistakes[q.q]) delete state.mistakes[q.q]; }
  else state.mistakes[q.q] = c;
}
function mistakeCount() { return Object.keys(state.mistakes).length; }
const CAT_NAMES = {
  phraseology: "Фразеология", standard: "Стандартные слова", readback: "Read-back",
  numbers: "Числа и частоты", weather: "Метео", emergency: "Аварийные",
  coordination: "Координация", lpr: "Уровень ИКАО", airport: "Аэропорт",
  pilot: "Пилот", cabin: "Бортпроводник", vocab: "Авиатермины", idioms: "Идиомы", other: "Прочее"
};
const ROLE_NAMES = { controller: "Диспетчер", pilot: "Пилот", cabin: "Бортпроводник", airport: "Сотрудник аэропорта" };

/* Меню главного экрана: каждый раздел привязан к ролям. "all" — общий (виден всем).
   При выборе роли показываются только её разделы + общие. */
const MENU = [
  { go: "alphabet", icon: "🔤", title: "Радиоалфавит", sub: "Алфавит ИКАО + числа · Doc 9432", roles: ["all"] },
  { go: "quiz-phraseology", icon: "🗼", title: "Фразеология", sub: "Стандартные команды · Doc 4444 гл.12", roles: ["controller", "pilot"] },
  { go: "quiz-standard", icon: "📻", title: "Стандартные слова", sub: "AFFIRM, WILCO, ROGER… · Doc 9432", roles: ["controller", "pilot"] },
  { go: "quiz-readback", icon: "🔁", title: "Read-back", sub: "Обратный повтор · Doc 4444 12.3.2", roles: ["controller", "pilot"] },
  { go: "quiz-numbers", icon: "🔢", title: "Числа и частоты", sub: "Произношение цифр · Doc 9432", roles: ["controller", "pilot"] },
  { go: "quiz-weather", icon: "🌦️", title: "Метео-фразеология", sub: "QNH, RVR, CAVOK, ветер · Doc 4444/Annex 3", roles: ["controller", "pilot"] },
  { go: "quiz-emergency", icon: "🚨", title: "Аварийные процедуры", sub: "MAYDAY, 7700/7600/7500 · Doc 4444 гл.15", roles: ["controller", "pilot"] },
  { go: "quiz-coordination", icon: "🔀", title: "Координация", sub: "Estimate, release, control · Doc 4444 гл.10", roles: ["controller"] },
  { go: "quiz-airport", icon: "🛃", title: "Аэропорт · пассажиры", sub: "Досмотр, регистрация · англ. с пассажирами", roles: ["airport"] },
  { go: "quiz-pilot", icon: "✈️", title: "Пилот · радиообмен", sub: "С позиции экипажа · Doc 4444/9432", roles: ["pilot"] },
  { go: "quiz-cabin", icon: "🧳", title: "Бортпроводник · сервис", sub: "Объявления и общение с пассажирами", roles: ["cabin"] },
  { go: "quiz-vocab", icon: "📖", title: "Авиатермины", sub: "Лексика аэропорта и полёта · словари ИКАО", roles: ["all"] },
  { go: "quiz-idioms", icon: "💬", title: "Идиомы и фразовые глаголы", sub: "Plain English для Level 5–6 · go around, level off…", roles: ["controller", "pilot"] },
  { go: "listening", icon: "👂", title: "На слух", sub: "Диктор читает указание · выбери read-back", roles: ["controller", "pilot"] },
  { go: "pron", icon: "🎤", title: "Произношение", sub: "Скажи фразу вслух · оценка речи", roles: ["controller", "pilot"] },
  { go: "dialogues", icon: "🎧", title: "Радиообмен", sub: "Собери диалог УВД ↔ борт", roles: ["controller", "pilot"] },
  { go: "scenario", icon: "🎙️", title: "Живой эфир", sub: "Целая смена TJK101 · таймер", roles: ["controller", "pilot"] },
  { go: "elpet", icon: "📋", title: "Экзамен ELPET / TEA", sub: "Формат TEA · 3 части · 6 критериев LPR", roles: ["controller", "pilot"] },
  { go: "exam", icon: "📝", title: "Экзамен", sub: "Случайный микс — 15 вопросов", roles: ["all"] },
  { go: "blitz", icon: "⏱️", title: "Экзамен на время", sub: "15 вопросов · таймер 20 c", roles: ["all"] },
  { go: "mistakes", icon: "🧯", title: "Работа над ошибками", sub: "", roles: ["all"] }
];

/* ───────── Управление доступностью плиток ─────────
   В каждой группе (роли) активны первые WIP_AFTER плиток, остальные помечаются
   «на стадии разработки» и по нажатию показывают тост вместо запуска.
   Чтобы подключить игру позже:
     • добавь её id (поле `go`) в LIVE_EXTRA — она станет активной в любой группе;
     • или увеличь WIP_AFTER, чтобы открыть больше плиток сразу во всех группах. */
const WIP_AFTER = 3;            // сколько плиток активно в начале каждой группы
const LIVE_EXTRA = [];          // id игр (go), всегда активных независимо от позиции
function isWip(go, idx) { return idx >= WIP_AFTER && LIVE_EXTRA.indexOf(go) < 0; }
/* Категории вопросов для роли — для микс-экзамена/блица (контент по роли) */
const ROLE_CATS = {
  controller: ["phraseology", "standard", "readback", "numbers", "weather", "emergency", "coordination", "vocab", "idioms"],
  pilot: ["phraseology", "standard", "readback", "numbers", "weather", "emergency", "pilot", "vocab", "idioms"],
  airport: ["airport", "vocab"],
  cabin: ["cabin", "vocab"]
};
function roleCats() { return ROLE_CATS[state.role] || ROLE_CATS.controller; }

/* ---------- Голоса диктора ---------- */
function enVoices() {
  const vs = (window.speechSynthesis ? window.speechSynthesis.getVoices() : []) || [];
  return vs.filter(v => /en[-_]/i.test(v.lang));
}

/* ---------- Утилиты ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(arr, n) { return shuffle(arr).slice(0, n); }

/* ---------- Детерминированный ГПСЧ (для «вызовов» — у всех один набор по seed) ---------- */
function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seededPick(arr, n, seed) {
  const r = mulberry32(hashSeed(String(seed)));
  const idx = arr.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.slice(0, n).map(i => arr[i]);
}

/* ---------- Звуковые сигналы через WebAudio (работают и в Telegram, в отличие от синтеза речи) ---------- */
let _actx = null;
function beep(ok) {
  if (!state.soundOn) return;
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === "suspended") _actx.resume();
    const now = _actx.currentTime;
    const o = _actx.createOscillator(), g = _actx.createGain();
    o.connect(g); g.connect(_actx.destination);
    if (ok) { o.type = "sine"; o.frequency.setValueAtTime(660, now); o.frequency.setValueAtTime(990, now + 0.09); }
    else { o.type = "square"; o.frequency.setValueAtTime(220, now); o.frequency.setValueAtTime(150, now + 0.13); }
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.16, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    o.start(now); o.stop(now + 0.3);
  } catch (e) {}
}

function rankFor(xp) {
  let r = DATA.ranks[0];
  for (const x of DATA.ranks) if (xp >= x.xp) r = x;
  return r;
}
function nextRank(xp) {
  for (const x of DATA.ranks) if (xp < x.xp) return x;
  return null;
}

/* ---------- Озвучка (Web Speech API, англ.) ---------- */
function speak(text, lang = "en-US", opts = {}) {
  if (!opts.force && !state.soundOn) return;
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = opts.rate || 0.9;
    if (state.voiceURI) {
      const v = (window.speechSynthesis.getVoices() || []).find(x => x.voiceURI === state.voiceURI);
      if (v) { u.voice = v; u.lang = v.lang; }
    }
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- Аудио: записанный файл, иначе живой синтез ---------- */
function sayAudio(file, text, rate) {
  const a = new Audio("./audio/" + file + ".wav");
  if (rate) a.playbackRate = rate;
  const fb = () => { if (text && !/[Ѐ-ӿ]/.test(text)) speak(text, "en-US", { force: true, rate: rate }); };
  a.onerror = fb;
  a.play().catch(fb);
}

/* ---------- Тосты / эффекты ---------- */
function toast(msg, cls = "") {
  const t = document.createElement("div");
  t.className = "toast " + cls;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.classList.add("show"), 20);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
}

function addXP(n) {
  state.xp += n;
  const before = rankFor(state.xp - n);
  const after = rankFor(state.xp);
  if (after.name !== before.name) {
    toast(`Новый ранг: ${after.icon} ${after.name}`, "rank");
    if (after.name === "Допущен к работе") unlock("level4");
    if (after.name === "Эксперт ИКАО") unlock("expert");
  }
  save();
}

function unlock(id) {
  if (state.achievements[id]) return;
  state.achievements[id] = Date.now();
  const a = DATA.achievements.find(x => x.id === id);
  if (a) toast(`Ачивка: ${a.icon} ${a.name}`, "ach");
  save();
}

/* ===========================================================================
   ЭКРАНЫ
   =========================================================================== */
const app = $("#app");

function renderHome() {
  const r = rankFor(state.xp);
  const nx = nextRank(state.xp);
  const prog = nx ? Math.round(((state.xp - r.xp) / (nx.xp - r.xp)) * 100) : 100;
  tgBack(false);
  const todayC = (state.daily.day === todayStr()) ? state.daily.count : 0;
  app.innerHTML = `
    <div class="langrow">
      ${["ru", "tg", "en"].map(L => `<button class="langchip ${(state.lang || "ru") === L ? "on" : ""}" onclick="changeLang('${L}')">${LANG_NAMES[L]}</button>`).join("")}
    </div>
    <div class="brand">✈ <b>AvEng</b> <span>· ${t("авиационный английский")}</span></div>
    <div class="roles">
      ${["controller", "pilot", "cabin", "airport"].map(rk =>
        `<button class="rolechip ${state.role === rk ? "on" : ""}" onclick="setRole('${rk}')">${t(ROLE_NAMES[rk])}</button>`
      ).join("")}
    </div>
    <div class="rankcard">
      <div class="rankicon">${r.icon}</div>
      <div class="rankinfo">
        <div class="rankname">${t(r.name)}</div>
        <div class="ranksub">${t("Шкала ИКАО")}: ${r.sub}</div>
        <div class="bar"><div class="fill" style="width:${prog}%"></div></div>
        <div class="xpline">${state.xp} XP ${nx ? `· ${t("до")} «${t(nx.name)}» ${nx.xp - state.xp} XP` : "· " + t("максимум!")}</div>
      </div>
    </div>

    <div class="daily">
      <span>🎯 ${t("Сегодня")} <b>${Math.min(todayC, state.daily.goal)}/${state.daily.goal}</b></span>
      <div class="dbar"><div class="dfill" style="width:${Math.min(100, Math.round(todayC / state.daily.goal * 100))}%"></div></div>
      <span>🔥 <b>${state.daily.streak}</b> ${t("дн.")}</span>
    </div>

    <div class="menu">
      ${MENU.filter(m => m.roles.indexOf("all") >= 0 || m.roles.indexOf(state.role) >= 0).map((m, i) =>
        tile(m.go, m.icon, t(m.title), m.go === "mistakes"
          ? (mistakeCount() ? mistakeCount() + " " + t("на повторение") : t("ошибок пока нет"))
          : t(m.sub), isWip(m.go, i))
      ).join("")}
    </div>

    <div class="row2">
      <button class="ghost" onclick="renderAch()">🏅 ${t("Ачивки")} (${Object.keys(state.achievements).length}/${DATA.achievements.length})</button>
      <button class="ghost" onclick="renderStats()">📊 ${t("Статистика")}</button>
    </div>
    <div class="row2">
      <button class="ghost" onclick="renderSettings()">⚙️ ${t("Настройки")}</button>
      <button class="ghost" onclick="renderRef()">📖 ${t("Справочник")}</button>
    </div>
    <button class="ghost fullrow" onclick="renderLeaderboard()">🏆 ${t("Лидерборд")}</button>
    <button class="ghost fullrow" onclick="renderCertificate()">🎓 ${t("Сертификат о прохождении")}</button>
    <button class="ghost fullrow" onclick="tgShare()">📨 ${t("Пригласить коллегу")}</button>
    <button class="ghost danger fullrow" onclick="resetAll()">↺ ${t("Сброс прогресса")}</button>
    <p class="disclaimer">${t("Учебный тренажёр на основе ICAO Doc 4444 (гл.12), Doc 9432 и Annex 1, Доп.1. Не заменяет официальные документы и аттестацию.")}</p>
    <p class="disclaimer">© 2026 Б.Б. Шералиев. ${t("Все права защищены. Копирование содержимого и кода без письменного разрешения автора запрещено.")} <a href="./TERMS.html" style="color:inherit;text-decoration:underline">${t("Условия")}</a></p>
  `;
}
function tile(go, icon, title, sub, wip) {
  if (wip) {
    return `<button class="tile wip" onclick="wipToast()">
      <span class="wipbadge">🔧 ${t("в разработке")}</span>
      <span class="ti">${icon}</span>
      <span class="tt">${title}</span>
      <span class="ts">${sub}</span>
    </button>`;
  }
  return `<button class="tile" onclick="route('${go}')">
    <span class="ti">${icon}</span>
    <span class="tt">${title}</span>
    <span class="ts">${sub}</span>
  </button>`;
}
function wipToast() { toast(t("Раздел на стадии разработки — скоро будет доступен"), "warn"); }

function route(go) {
  track("open/" + go);
  if (go === "alphabet") return renderAlphabet();
  if (go === "listening") return renderListening();
  if (go === "dialogues") return renderDialogues();
  if (go === "exam") return startQuiz(pick(DATA.quiz.filter(q => roleCats().indexOf(q.cat) >= 0), 15), "Экзамен", null);
  if (go === "blitz") return startQuiz(pick(DATA.quiz.filter(q => roleCats().indexOf(q.cat) >= 0), 15), "Экзамен на время", null, { timed: true, secs: 20 });
  if (go === "mistakes") return startMistakes();
  if (go === "scenario") return renderScenario();
  if (go === "pron") return renderPron();
  if (go === "elpet") return startElpet();
  if (go.startsWith("quiz-")) {
    const cat = go.slice(5);
    const pool = DATA.quiz.filter(q => q.cat === cat);
    const titles = { phraseology: "Фразеология", standard: "Стандартные слова", readback: "Read-back", numbers: "Числа и частоты", lpr: "Уровень ИКАО", weather: "Метео-фразеология", emergency: "Аварийные процедуры", coordination: "Координация", airport: "Аэропорт · пассажиры", pilot: "Пилот · радиообмен", cabin: "Бортпроводник · сервис", vocab: "Авиатермины", idioms: "Идиомы и фразовые глаголы" };
    return startQuiz(shuffle(pool), titles[cat] || "Тест", cat);
  }
}

/* ---------- Топбар ---------- */
function topbar(title) {
  tgBack(true);
  return `<div class="topbar">
    <button class="back" onclick="renderHome()">${t("‹ Меню")}</button>
    <span class="ttitle">${title}</span>
    <span class="xpchip">${state.xp} XP</span>
  </div>`;
}

/* ===========================================================================
   КВИЗ (общий движок для всех категорий)
   =========================================================================== */
let quiz = null;
let quizTimer = null;
function startQuiz(questions, title, cat, opts = {}) {
  quiz = { qs: questions, i: 0, correct: 0, streak: 0, lives: 3, title, cat, timed: !!opts.timed, secs: opts.secs || 20, log: [], challenge: opts.challenge || null };
  renderQuestion();
}
function renderQuestion() {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  if (quiz.i >= quiz.qs.length || quiz.lives <= 0) return renderQuizResult();
  const q = quiz.qs[quiz.i];
  const opts = q.a.map((t, idx) => ({ t, idx }));
  const shown = shuffle(opts);
  app.innerHTML = `
    ${topbar(quiz.title)}
    <div class="hud">
      <span>Вопрос ${quiz.i + 1}/${quiz.qs.length}</span>
      <span class="lives">${"❤️".repeat(quiz.lives)}${"🖤".repeat(3 - quiz.lives)}</span>
      <span class="streak">🔥 ${quiz.streak}</span>
    </div>
    ${quiz.timed ? `<div class="tbar"><div class="tfill" id="tfill"></div></div>` : ""}
    <div class="qcard">
      <div class="qtext">${q.q}</div>
      <div class="opts">
        ${shown.map(o => `<button class="opt" data-i="${o.idx}">${o.t}</button>`).join("")}
      </div>
      <div class="feedback" id="fb"></div>
    </div>
  `;
  $$(".opt").forEach(b => b.addEventListener("click", () => answer(parseInt(b.dataset.i), b)));
  if (quiz.timed) {
    let left = quiz.secs * 1000;
    const fill = $("#tfill");
    quizTimer = setInterval(() => {
      const bar = $("#tfill");
      if (!bar) { clearInterval(quizTimer); quizTimer = null; return; }
      left -= 100;
      bar.style.width = Math.max(0, left / (quiz.secs * 1000) * 100) + "%";
      if (left <= 0) { clearInterval(quizTimer); quizTimer = null; if (!$("#fb").dataset.locked) answer(-1, null); }
    }, 100);
  }
}
function answer(chosen, btn) {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  const q = quiz.qs[quiz.i];
  if ($("#fb").dataset.locked) return;
  $("#fb").dataset.locked = "1";
  const correct = chosen === q.correct;
  tgHaptic(correct ? "success" : "error");
  beep(correct);
  quiz.log.push({ cat: q.cat || "other", ok: correct });
  recordQuiz(q, correct);
  markDaily();
  $$(".opt").forEach(b => {
    const i = parseInt(b.dataset.i);
    b.disabled = true;
    if (i === q.correct) b.classList.add("right");
    else if (b === btn) b.classList.add("wrong");
  });
  if (correct) {
    quiz.correct++; quiz.streak++; state.totalCorrect++;
    state.streakBest = Math.max(state.streakBest, quiz.streak);
    if (quiz.cat === "phraseology") { state.phrasCorrect++; if (state.phrasCorrect >= 20) unlock("phras"); }
    unlock("first");
    if (quiz.streak >= 5) unlock("streak5");
    if (quiz.streak >= 10) unlock("streak10");
    const gain = 10 + Math.min(quiz.streak, 10);
    addXP(gain);
    speak("Correct");
    $("#fb").innerHTML = `<div class="fb ok">✅ Верно +${gain} XP</div>
      <div class="why">${q.why}</div><div class="src">📄 ${q.src}</div>`;
  } else {
    quiz.streak = 0; quiz.lives--;
    speak("Negative");
    $("#fb").innerHTML = `<div class="fb no">❌ Неверно. Правильно: «${q.a[q.correct]}»</div>
      <div class="why">${q.why}</div><div class="src">📄 ${q.src}</div>`;
  }
  $("#fb").innerHTML += `<button class="next" id="next">${quiz.i + 1 >= quiz.qs.length || quiz.lives <= 0 ? "Итог →" : "Дальше →"}</button>`;
  $("#next").addEventListener("click", () => { quiz.i++; renderQuestion(); });
  save();
}
/* Оценочный уровень ИКАО (LPR) по проценту — индикативно, не аттестация */
function lprLevel(pct, failed) {
  if (failed || pct < 50) return { lvl: "—", name: "Pre-elementary", note: "ниже рабочего уровня", c: "no" };
  if (pct < 70) return { lvl: "3", name: "Pre-operational", note: "ещё не допуск (нужен Level 4)", c: "no" };
  if (pct < 85) return { lvl: "4", name: "Operational", note: "рабочий минимум ИКАО", c: "ok" };
  if (pct < 95) return { lvl: "5", name: "Extended", note: "уверенный уровень", c: "ok" };
  return { lvl: "6", name: "Expert", note: "экспертный уровень", c: "ok" };
}
function resultBreakdown() {
  const by = {};
  quiz.log.forEach(e => { (by[e.cat] = by[e.cat] || { c: 0, t: 0 }), by[e.cat].t++; if (e.ok) by[e.cat].c++; });
  const cats = Object.keys(by);
  if (cats.length <= 1) return "";
  const rows = cats.map(c => {
    const p = Math.round(by[c].c / by[c].t * 100);
    const cls = p >= 70 ? "ok" : "no";
    return `<div class="brrow"><span class="brname">${CAT_NAMES[c] || c}</span>
      <span class="brbar"><span class="brfill ${cls}" style="width:${p}%"></span></span>
      <span class="brval">${by[c].c}/${by[c].t}</span></div>`;
  }).join("");
  return `<div class="breakdown"><div class="brtitle">По темам</div>${rows}</div>`;
}
function renderQuizResult() {
  const pct = Math.round((quiz.correct / quiz.qs.length) * 100);
  const failed = quiz.lives <= 0;
  track("done/" + (quiz.cat || quiz.title || "quiz"));
  const lp = lprLevel(pct, failed);
  const vc = lp.c;
  const verdict = failed ? "Жизни закончились — потренируйтесь ещё"
    : pct >= 95 ? "Великолепно! Экспертный уровень"
    : pct >= 85 ? "Отлично — уверенный уровень"
    : pct >= 70 ? "Хорошо — рабочий минимум ИКАО"
    : pct >= 50 ? "Неплохо, но нужно повторить" : "Нужно повторить материал";
  const retry = quiz.cat === "review" ? "startMistakes()"
    : quiz.timed ? "route('blitz')"
    : quiz.cat ? `route('quiz-${quiz.cat}')`
    : "route('exam')";
  const ch = quiz.challenge;
  app.innerHTML = `
    ${topbar(quiz.title)}
    <div class="result">
      <div class="bigpct ${vc}">${pct}%</div>
      <div class="verdict ${vc}">${verdict}</div>
      <div class="lprbadge ${vc}">Оценочный уровень ИКАО: <b>Level ${lp.lvl}</b> · ${lp.name}<small>${lp.note} · ориентир, не аттестация</small></div>
      <div class="rstats">Правильно ${quiz.correct} из ${quiz.qs.length} · Лучшая серия 🔥 ${state.streakBest}</div>
      ${resultBreakdown()}
      ${ch ? `<div class="chresult">⚔️ Вызов пройден! Ваш счёт: <b>${pct}%</b> (${quiz.correct}/${quiz.qs.length})</div>` : ""}
      <div class="row2">
        <button class="primary" onclick="shareResult(${pct}, ${quiz.correct}, ${quiz.qs.length}, '${lp.lvl}')">📲 Поделиться</button>
        <button class="ghost" onclick="startChallenge()">⚔️ Бросить вызов</button>
      </div>
      <div class="row2">
        <button class="ghost" onclick="${retry}">↻ Ещё раз</button>
        <button class="ghost" onclick="renderHome()">В меню</button>
      </div>
    </div>
  `;
  if (vc === "ok" && !failed) confetti();
}

/* ===========================================================================
   ТРЕНАЖЁР АЛФАВИТА
   =========================================================================== */
let alpha = null;
function renderAlphabet() {
  alpha = { items: shuffle(DATA.alphabet.concat(DATA.numbers.filter(x => x.n.length === 1).map(x => ({ l: x.n, w: x.say, say: x.say, num: true })))), i: 0, correct: 0, errors: 0 };
  alpha.items = alpha.items.slice(0, 20);
  renderAlphaQ();
}
function renderAlphaQ() {
  if (alpha.i >= alpha.items.length) {
    if (alpha.errors === 0) { state.alphabetPerfect = true; unlock("alpha"); save(); }
    app.innerHTML = `${topbar("Радиоалфавит")}
      <div class="result">
        <div class="bigpct ${alpha.errors === 0 ? "ok" : ""}">${alpha.correct}/${alpha.items.length}</div>
        <div class="verdict">${alpha.errors === 0 ? "Идеально! 🔤 Без ошибок" : "Ошибок: " + alpha.errors}</div>
        <div class="row2">
          <button class="primary" onclick="renderAlphabet()">↻ Ещё</button>
          <button class="ghost" onclick="renderHome()">В меню</button>
        </div>
      </div>`;
    return;
  }
  const it = alpha.items[alpha.i];
  const correctWord = it.num ? it.say : it.w;
  const af = it.num ? ("num-" + it.l) : ("alpha-" + it.l);
  let distract;
  if (it.num) distract = DATA.numbers.map(x => x.say);
  else distract = (it.near && it.near.length) ? it.near : DATA.alphabet.map(x => x.w);
  const opts = shuffle([correctWord, ...pick(distract.filter(w => w !== correctWord), 3)]);
  app.innerHTML = `
    ${topbar("Радиоалфавит")}
    <div class="hud"><span>${alpha.i + 1}/${alpha.items.length}</span><span>✅ ${alpha.correct}</span></div>
    <div class="qcard">
      <div class="bigletter">${it.l}</div>
      <div class="qsub">Как звучит по правилам радиообмена?</div>
      <button class="listen" onclick="sayAudio('${af}','${correctWord}')">🔊 Прослушать</button>
      <div class="opts">
        ${opts.map(o => `<button class="opt" data-w="${o}">${o}</button>`).join("")}
      </div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => {
    if ($("#fb").dataset.locked) return; $("#fb").dataset.locked = "1";
    const ok = b.dataset.w === correctWord;
    $$(".opt").forEach(x => { x.disabled = true; if (x.dataset.w === correctWord) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
    if (ok) { alpha.correct++; addXP(6); sayAudio(af, correctWord); }
    else { alpha.errors++; }
    markDaily();
    const say = it.num ? "" : `<div class="src">Произношение: ${it.say}</div>`;
    $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ Верно" : "❌ Правильно: " + correctWord}</div>${say}
      <button class="next" id="next">Дальше →</button>`;
    $("#next").addEventListener("click", () => { alpha.i++; renderAlphaQ(); });
  }));
}

/* ===========================================================================
   ДИАЛОГИ
   =========================================================================== */
let dlg = null;
function renderDialogues() {
  dlg = { i: 0, correct: 0 };
  renderDlgQ();
}
function renderDlgQ() {
  if (dlg.i >= DATA.dialogues.length) {
    state.dialoguesDone = true; unlock("dialog"); save();
    app.innerHTML = `${topbar("Радиообмен")}
      <div class="result">
        <div class="bigpct ok">${dlg.correct}/${DATA.dialogues.length}</div>
        <div class="verdict">Радиообмен пройден 🎧</div>
        <div class="row2">
          <button class="primary" onclick="renderDialogues()">↻ Ещё</button>
          <button class="ghost" onclick="renderHome()">В меню</button>
        </div>
      </div>`;
    return;
  }
  const d = DATA.dialogues[dlg.i];
  const opts = shuffle(d.options.map((t, idx) => ({ t, idx })));
  app.innerHTML = `
    ${topbar("Радиообмен")}
    <div class="hud"><span>Эпизод ${dlg.i + 1}/${DATA.dialogues.length}</span><span>✅ ${dlg.correct}</span></div>
    <div class="qcard">
      <div class="scene">📍 ${d.scene}</div>
      <div class="radio pilot">✈️ Борт: <button class="mini" onclick="sayAudio('dlg-${dlg.i}', \`${d.pilot.replace(/`/g, "")}\`)">🔊</button><br>«${d.pilot}»</div>
      <div class="qsub">Ваша реплика как диспетчера:</div>
      <div class="opts">
        ${opts.map(o => `<button class="opt" data-i="${o.idx}">${o.t}</button>`).join("")}
      </div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => {
    if ($("#fb").dataset.locked) return; $("#fb").dataset.locked = "1";
    const i = parseInt(b.dataset.i);
    const ok = i === d.correct;
    $$(".opt").forEach(x => { x.disabled = true; const xi = parseInt(x.dataset.i); if (xi === d.correct) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
    if (ok) { dlg.correct++; addXP(15); speak(d.options[d.correct]); }
    tgHaptic(ok ? "success" : "error");
    markDaily();
    $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ Верно +15 XP" : "❌ Правильно: «" + d.options[d.correct] + "»"}</div>
      <div class="why">${d.why}</div>
      <button class="next" id="next">${dlg.i + 1 >= DATA.dialogues.length ? "Итог →" : "Дальше →"}</button>`;
    $("#next").addEventListener("click", () => { dlg.i++; renderDlgQ(); });
  }));
}

/* ===========================================================================
   ЖИВОЙ ЭФИР (сценарий — целая смена, лента эфира + таймер)
   =========================================================================== */
let sc = null;
function renderScenario() {
  sc = { i: 0, correct: 0, log: [], secs: 25 };
  renderScenarioStep();
}
function renderScenarioStep() {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  if (sc.i >= DATA.dialogues.length) {
    const pct = Math.round(sc.correct / DATA.dialogues.length * 100);
    app.innerHTML = `${topbar("Живой эфир")}
      <div class="result">
        <div class="bigpct ${pct >= 70 ? "ok" : "no"}">${pct}%</div>
        <div class="verdict ${pct >= 70 ? "ok" : "no"}">Смена завершена 🎙️</div>
        <div class="rstats">Верных реплик: ${sc.correct} из ${DATA.dialogues.length}</div>
        <div class="row2">
          <button class="primary" onclick="renderScenario()">↻ Новая смена</button>
          <button class="ghost" onclick="renderHome()">В меню</button>
        </div>
      </div>`;
    return;
  }
  const d = DATA.dialogues[sc.i];
  const opts = shuffle(d.options.map((t, idx) => ({ t, idx })));
  app.innerHTML = `${topbar("Живой эфир")}
    <div class="hud"><span>📻 Эфир TJK101</span><span>${sc.i + 1}/${DATA.dialogues.length}</span><span>✅ ${sc.correct}</span></div>
    ${sc.log.length ? `<div class="airlog" id="airlog">${sc.log.map(l => `<div class="airline ${l.who}">${l.who === "p" ? "✈️" : "🗼"} ${l.text}</div>`).join("")}</div>` : ""}
    <div class="tbar"><div class="tfill" id="tfill"></div></div>
    <div class="qcard">
      <div class="scene">📍 ${d.scene}</div>
      <div class="radio pilot">✈️ Борт: <button class="mini" onclick="sayAudio('dlg-${sc.i}', \`${d.pilot.replace(/`/g, "")}\`)">🔊</button><br>«${d.pilot}»</div>
      <div class="qsub">Ваша реплика — эфир живой, не тяните:</div>
      <div class="opts">${opts.map(o => `<button class="opt" data-i="${o.idx}">${o.t}</button>`).join("")}</div>
      <div class="feedback" id="fb"></div>
    </div>`;
  sayAudio("dlg-" + sc.i, d.pilot.replace(/`/g, ""));
  let left = sc.secs * 1000;
  quizTimer = setInterval(() => {
    const bar = $("#tfill");
    if (!bar) { clearInterval(quizTimer); quizTimer = null; return; }
    left -= 100;
    bar.style.width = Math.max(0, left / (sc.secs * 1000) * 100) + "%";
    if (left <= 0) { clearInterval(quizTimer); quizTimer = null; if (!$("#fb").dataset.locked) scAnswer(-1, null); }
  }, 100);
  $$(".opt").forEach(b => b.addEventListener("click", () => scAnswer(parseInt(b.dataset.i), b)));
}
function scAnswer(i, btn) {
  if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
  if ($("#fb").dataset.locked) return;
  $("#fb").dataset.locked = "1";
  const d = DATA.dialogues[sc.i];
  const ok = i === d.correct;
  tgHaptic(ok ? "success" : "error");
  markDaily();
  $$(".opt").forEach(x => { x.disabled = true; const xi = parseInt(x.dataset.i); if (xi === d.correct) x.classList.add("right"); else if (x === btn) x.classList.add("wrong"); });
  if (ok) { sc.correct++; addXP(15); speak(d.options[d.correct]); }
  sc.log.push({ who: "p", text: "«" + d.pilot + "»" });
  sc.log.push({ who: "c", text: "«" + d.options[d.correct] + "»" + (ok ? "" : " ✓") });
  $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ Верно +15 XP" : "❌ Правильно: «" + d.options[d.correct] + "»"}</div>
    <div class="why">${d.why}</div>
    <button class="next" id="next">${sc.i + 1 >= DATA.dialogues.length ? "Дебриф →" : "Дальше →"}</button>`;
  $("#next").addEventListener("click", () => { sc.i++; renderScenarioStep(); });
}

/* ===========================================================================
   ПРОИЗНОШЕНИЕ (Web Speech Recognition, с фолбэком)
   =========================================================================== */
let pr = null;
const PRON_PHRASES = DATA.dialogues
  .map(d => d.options[d.correct].replace(/TJK101[,:]?\s*/g, "").trim())
  .filter(s => /^[A-Za-z]/.test(s) && s.length < 70);
const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, tree: 3, four: 4, fower: 4, five: 5, fife: 5, six: 6, seven: 7, eight: 8, ait: 8, nine: 9, niner: 9 };
function normPron(s) {
  s = (s || "").toLowerCase().replace(/[^a-z0-9\s.]/g, " ");
  const toks = s.split(/\s+/).filter(Boolean).map(t => NUMWORDS[t] !== undefined ? String(NUMWORDS[t]) : t);
  const out = [];
  for (const t of toks) {
    if (/^\d$/.test(t) && out.length && /^\d+$/.test(out[out.length - 1])) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
}
function pronScore(expected, heard) {
  const e = normPron(expected), h = normPron(heard).slice();
  if (!e.length) return 0;
  let m = 0;
  for (const w of e) { const idx = h.indexOf(w); if (idx >= 0) { m++; h.splice(idx, 1); } }
  return Math.round(m / e.length * 100);
}
function hasSR() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function renderPron() {
  if (!hasSR()) {
    app.innerHTML = `${topbar("Произношение")}
      <div class="qcard"><div class="qtext">🎤 Распознавание речи недоступно в этом браузере.</div>
      <div class="why">Откройте AvEng в <b>Chrome</b> на компьютере или Android. В Telegram на iPhone (и в Safari) распознавание речи не поддерживается — там пользуйтесь режимами «На слух» и «Радиообмен».</div>
      <button class="next" onclick="renderHome()">В меню</button></div>`;
    return;
  }
  pr = { items: shuffle(PRON_PHRASES).slice(0, 8), i: 0, best: 0, sum: 0, done: 0 };
  renderPronStep();
}
function renderPronStep() {
  if (pr.i >= pr.items.length) {
    const avg = pr.done ? Math.round(pr.sum / pr.done) : 0;
    app.innerHTML = `${topbar("Произношение")}
      <div class="result">
        <div class="bigpct ${avg >= 70 ? "ok" : "no"}">${avg}%</div>
        <div class="verdict ${avg >= 70 ? "ok" : "no"}">Среднее совпадение</div>
        <div class="rstats">Тренируется Pronunciation (шкала ИКАО). Это самооценка, не аттестация.</div>
        <div class="row2">
          <button class="primary" onclick="renderPron()">↻ Ещё</button>
          <button class="ghost" onclick="renderHome()">В меню</button>
        </div>
      </div>`;
    return;
  }
  const phrase = pr.items[pr.i];
  app.innerHTML = `${topbar("Произношение")}
    <div class="hud"><span>${pr.i + 1}/${pr.items.length}</span><span>🎤 говорите вслух</span></div>
    <div class="qcard">
      <div class="qsub">Прочитайте фразу по-английски:</div>
      <div class="pronphrase">«${phrase}»</div>
      <button class="listen" onclick="speak('${phrase.replace(/'/g, "")}','en-US',{force:true})">🔊 Образец</button>
      <button class="bigplay mic" id="mic" onclick="pronListen()">🎤</button>
      <div class="audiohint" id="micstate">Нажмите микрофон и произнесите фразу</div>
      <div class="feedback" id="fb"></div>
    </div>`;
}
function pronListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec;
  try { rec = new SR(); } catch (e) { $("#micstate").textContent = "Не удалось запустить распознавание."; return; }
  rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
  const mic = $("#mic");
  if (mic) mic.classList.add("rec");
  $("#micstate").textContent = "Слушаю… говорите фразу";
  rec.onresult = e => {
    const heard = e.results[0][0].transcript;
    pronResult(heard);
  };
  rec.onerror = e => {
    if ($("#mic")) $("#mic").classList.remove("rec");
    const m = e.error === "not-allowed" ? "Нет доступа к микрофону — разрешите его в браузере." : "Не расслышал (" + e.error + "). Нажмите ещё раз.";
    if ($("#micstate")) $("#micstate").textContent = m;
  };
  rec.onend = () => { if ($("#mic")) $("#mic").classList.remove("rec"); };
  try { rec.start(); } catch (err) { $("#micstate").textContent = "Микрофон занят, попробуйте ещё раз."; }
}
function pronResult(heard) {
  if ($("#fb").dataset.locked) return;
  $("#fb").dataset.locked = "1";
  const phrase = pr.items[pr.i];
  const score = pronScore(phrase, heard);
  pr.sum += score; pr.done++;
  const cls = score >= 80 ? "ok" : score >= 50 ? "" : "no";
  if (score >= 50) { addXP(10); markDaily(); tgHaptic("success"); } else tgHaptic("error");
  $("#micstate").textContent = "";
  $("#fb").innerHTML = `<div class="fb ${score >= 50 ? "ok" : "no"}">Совпадение ${score}%${score >= 50 ? " +10 XP" : ""}</div>
    <div class="why">Распознано: «${heard}»</div>
    <div class="src">Эталон: «${phrase}»</div>
    <button class="next" id="next">${pr.i + 1 >= pr.items.length ? "Итог →" : "Дальше →"}</button>`;
  $("#next").addEventListener("click", () => { pr.i++; renderPronStep(); });
}

/* ===========================================================================
   РЕЖИМ «НА СЛУХ»
   =========================================================================== */
let lst = null;
let lstAudio = null;
function renderListening() {
  // звук: либо записанные файлы (работают везде, вкл. Telegram), либо живой синтез
  lst = { items: shuffle(DATA.listening), i: 0, correct: 0, errors: 0, rate: 0.9 };
  renderLstQ();
}
function playCurrent() {
  const it = lst.items[lst.i];
  const idx = DATA.listening.indexOf(it);
  if (lstAudio) { try { lstAudio.pause(); } catch (e) {} lstAudio = null; }
  if (idx >= 0) {
    const a = new Audio("./audio/listen-" + idx + ".wav");
    a.playbackRate = lst.rate;
    a.onerror = () => speak(it.audio, "en-US", { force: true, rate: lst.rate });
    lstAudio = a;
    a.play().catch(() => speak(it.audio, "en-US", { force: true, rate: lst.rate }));
  } else {
    speak(it.audio, "en-US", { force: true, rate: lst.rate });
  }
}
function renderLstQ() {
  if (lst.i >= lst.items.length) {
    if (lst.errors === 0) unlock("ear");
    const pct = Math.round((lst.correct / lst.items.length) * 100);
    app.innerHTML = `${topbar("На слух")}
      <div class="result">
        <div class="bigpct ${lst.errors === 0 ? "ok" : ""}">${lst.correct}/${lst.items.length}</div>
        <div class="verdict">${lst.errors === 0 ? "Идеальный слух! 👂" : "Понимание на слух: " + pct + "%"}</div>
        <div class="rstats">Тренируется область Comprehension (шкала ИКАО)</div>
        <div class="row2">
          <button class="primary" onclick="renderListening()">↻ Ещё</button>
          <button class="ghost" onclick="renderHome()">В меню</button>
        </div>
      </div>`;
    return;
  }
  const it = lst.items[lst.i];
  const opts = shuffle(it.options.map((t, idx) => ({ t, idx })));
  app.innerHTML = `
    ${topbar("На слух")}
    <div class="hud">
      <span>${lst.i + 1}/${lst.items.length}</span>
      <span>👂 ${it.type === "readback" ? "Read-back" : "Смысл"}</span>
      <span>✅ ${lst.correct}</span>
    </div>
    <div class="qcard">
      <div class="audiobox">
        <button class="bigplay" id="play">▶</button>
        <div class="audiohint">Нажмите и прослушайте указание диспетчера</div>
        <div class="speedrow">
          <button class="spd" data-r="0.7">🐢 медленно</button>
          <button class="spd" data-r="0.9">▶ норма</button>
          <button class="spd" data-r="1.0">🐇 быстро</button>
        </div>
      </div>
      <div class="qsub">${it.task}</div>
      <div class="opts">
        ${opts.map(o => `<button class="opt" data-i="${o.idx}">${o.t}</button>`).join("")}
      </div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $("#play").addEventListener("click", playCurrent);
  $$(".spd").forEach(b => b.addEventListener("click", () => { lst.rate = parseFloat(b.dataset.r); playCurrent(); }));
  playCurrent(); // автопроигрывание при показе
  $$(".opt").forEach(b => b.addEventListener("click", () => {
    if ($("#fb").dataset.locked) return; $("#fb").dataset.locked = "1";
    const i = parseInt(b.dataset.i);
    const ok = i === it.correct;
    $$(".opt").forEach(x => { x.disabled = true; const xi = parseInt(x.dataset.i); if (xi === it.correct) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
    if (ok) { lst.correct++; addXP(12); unlock("first"); }
    else { lst.errors++; }
    tgHaptic(ok ? "success" : "error");
    markDaily();
    $("#fb").innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ Верно +12 XP" : "❌ Правильно: «" + it.options[it.correct] + "»"}</div>
      <div class="why">${it.why}</div>
      <div class="src">🔊 Прозвучало: «${it.audio}»</div>
      <button class="next" id="next">${lst.i + 1 >= lst.items.length ? "Итог →" : "Дальше →"}</button>`;
    $("#next").addEventListener("click", () => { lst.i++; renderLstQ(); });
  }));
}

/* ===========================================================================
   АЧИВКИ / СПРАВОЧНИК / ПРОЧЕЕ
   =========================================================================== */
function renderAch() {
  app.innerHTML = `${topbar("Ачивки")}
    <div class="achlist">
      ${DATA.achievements.map(a => {
        const got = state.achievements[a.id];
        return `<div class="achitem ${got ? "got" : "locked"}">
          <span class="ai">${got ? a.icon : "🔒"}</span>
          <span class="ad"><b>${a.name}</b><small>${a.desc}</small></span>
        </div>`;
      }).join("")}
    </div>`;
}

function renderRef() {
  app.innerHTML = `${topbar("Справочник")}
    <div class="ref">
      <h3>🔤 Радиоалфавит ИКАО</h3>
      <div class="reftable">
        ${DATA.alphabet.map(a => `<div class="refrow"><b>${a.l}</b> ${a.w} <i>${a.say}</i></div>`).join("")}
      </div>
      <h3>🔢 Произношение цифр</h3>
      <div class="reftable">
        ${DATA.numbers.map(n => `<div class="refrow"><b>${n.n}</b> <i>${n.say}</i></div>`).join("")}
      </div>
      <h3>📻 Ключевые стандартные слова (Doc 9432)</h3>
      <div class="refnote">
        <p><b>AFFIRM</b> — да · <b>NEGATIVE</b> — нет</p>
        <p><b>ROGER</b> — принял · <b>WILCO</b> — понял, выполню</p>
        <p><b>STANDBY</b> — ждите, вызову · <b>SAY AGAIN</b> — повторите</p>
        <p><b>CORRECTION</b> — исправление · <b>DISREGARD</b> — не принимайте во внимание</p>
        <p><b>ACKNOWLEDGE</b> — подтвердите приём · <b>UNABLE</b> — не могу выполнить</p>
        <p><b>CONTACT</b> — установите связь · <b>MONITOR</b> — слушайте частоту</p>
        <p><b>MAINTAIN</b> — выдерживайте/продолжайте · <b>BREAK</b> — разделение сообщений</p>
        <p><b>HOLD POSITION</b> — оставаться на месте · <b>LINE UP AND WAIT</b> — занять ВПП и ждать</p>
        <p><b>CLEARED FOR TAKE-OFF</b> / <b>CLEARED TO LAND</b> — разрешения ВПП</p>
      </div>
      <h3>🎖️ Шкала языка ИКАО (Annex 1, Доп.1)</h3>
      <div class="refnote">
        <p>6 уровней: 1 Pre-elementary · 2 Elementary · 3 Pre-operational · 4 <b>Operational (минимум)</b> · 5 Extended · 6 Expert</p>
        <p>6 областей: Pronunciation · Structure · Vocabulary · Fluency · Comprehension · Interactions</p>
        <p>Переоценка: L4 — ≤3 года, L5 — ≤6 лет, L6 — бессрочно.</p>
      </div>
    </div>`;
}

/* ---------- Работа над ошибками ---------- */
function startMistakes() {
  const keys = Object.keys(state.mistakes);
  const qs = DATA.quiz.filter(q => keys.indexOf(q.q) !== -1);
  if (!qs.length) { toast("Ошибок нет — отлично! 🎉"); renderHome(); return; }
  startQuiz(shuffle(qs).slice(0, 15), "Работа над ошибками", "review");
}

/* ---------- Статистика ---------- */
function renderStats() {
  const cats = Object.keys(state.catStats);
  const rows = cats.length ? cats.map(c => {
    const s = state.catStats[c];
    const p = Math.round(s.correct / s.total * 100);
    const cls = p >= 80 ? "ok" : p >= 60 ? "mid" : "low";
    return `<div class="statrow">
      <div class="statlbl">${CAT_NAMES[c] || c}<span>${s.correct}/${s.total}</span></div>
      <div class="statbar"><div class="statfill ${cls}" style="width:${p}%"></div></div>
      <div class="statpct">${p}%</div>
    </div>`;
  }).join("") : `<p class="qsub">Пока нет данных — пройдите несколько вопросов.</p>`;
  let weak = null;
  cats.forEach(c => { const s = state.catStats[c]; if (s.total >= 3) { const p = s.correct / s.total; if (!weak || p < weak.p) weak = { c, p }; } });
  app.innerHTML = `${topbar("Статистика")}
    <div class="qcard">
      <div class="bigstat">
        <div><b>${state.totalCorrect}</b><span>верных всего</span></div>
        <div><b>🔥 ${state.streakBest}</b><span>лучшая серия</span></div>
        <div><b>${state.daily.streak}</b><span>дней подряд</span></div>
      </div>
    </div>
    <div class="qcard">
      <div class="qsub">Точность по темам</div>
      ${rows}
      ${weak ? `<div class="weak">Слабее всего: <b>${CAT_NAMES[weak.c] || weak.c}</b> — стоит подтянуть.</div>` : ""}
      ${mistakeCount() ? `<button class="next" onclick="startMistakes()">🧯 Повторить ошибки (${mistakeCount()})</button>` : ""}
    </div>`;
}

/* ---------- Язык ---------- */
function changeLang(L) { state.lang = L; save(); renderHome(); }

/* ---------- Лидерборд (Google Apps Script + Таблица, как в «Ремонте») ----------
   После деплоя Web App вставьте его URL в scriptUrl (код: backend/leaderboard.gs). Пусто = «не настроено». */
const LEADERBOARD = { scriptUrl: "https://script.google.com/macros/s/AKfycbwjtZxqOdL58_JvAI_A6Ou5AYdC8JMytvXb4W3ZVyBcfnhr087z-tQFC5wAcMCXJ38J/exec" };
/* Ежедневные напоминания от бота: включить ПОСЛЕ обновления скрипта на backend/reminders.gs
   и добавления BOT_TOKEN в Script properties (см. инструкцию в файле). До этого — false,
   иначе регистрация подписчиков создаст мусор в таблице. */
const REMINDERS = { on: false };

/* ---------- Аналитика использования (GoatCounter — бесплатно, без cookies) ----------
   Считает: визиты (просмотры) + события внутри игры (какие модули открывают, прохождения).
   Подключение: зарегистрируй бесплатный код на https://www.goatcounter.com/ (например "aveng",
   адрес будет https://aveng.goatcounter.com), и впиши его сюда. Пусто = аналитика выключена. */
const ANALYTICS = { goatcounter: "aveng" };
function plat() { return (typeof inTelegram !== "undefined" && inTelegram) ? "tg" : "web"; }
function initAnalytics() {
  if (!ANALYTICS.goatcounter || window.goatcounter) return;
  window.goatcounter = { no_onload: true };      // просмотр шлём сами — с меткой платформы (tg/web)
  const s = document.createElement("script");
  s.async = true; s.src = "//gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", "https://" + ANALYTICS.goatcounter + ".goatcounter.com/count");
  s.onload = function () { try { goatcounter.count({ path: plat() + "/visit", title: "visit-" + plat() }); } catch (e) {} };
  document.head.appendChild(s);
}
function track(path) {                            // событие внутри игры (не просмотр страницы), с меткой платформы
  try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: plat() + "/" + String(path), event: true }); } catch (e) {}
}
function trackSource() {                          // откуда пришёл: по приглашению (startapp=inv), вызову (ch_) и т.п.
  try {
    var sp = inTelegram && TG.initDataUnsafe && TG.initDataUnsafe.start_param;
    if (!sp) return;
    var src = /^ch_/i.test(sp) ? "challenge" : String(sp).replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
    if (src) track("src/" + src);
  } catch (e) {}
}

function lbReady() { return !!LEADERBOARD.scriptUrl; }
function lbRegister() {
  if (!REMINDERS.on || !lbReady() || !inTelegram) return;
  try {
    const u = TG.initDataUnsafe && TG.initDataUnsafe.user;
    if (!u || !u.id) return;
    const name = ((u.first_name || "") + (u.last_name ? " " + u.last_name : "")) || u.username || "TG";
    fetch(LEADERBOARD.scriptUrl, { method: "POST", body: JSON.stringify({ action: "register", id: u.id, name: name }) }).catch(() => {});
  } catch (e) {}
}
function lbName() {
  try { if (inTelegram && TG.initDataUnsafe && TG.initDataUnsafe.user) { const u = TG.initDataUnsafe.user; return ((u.first_name || "") + (u.last_name ? " " + u.last_name : "")) || u.username || "TG"; } } catch (e) {}
  return "Гость";
}
function renderLeaderboard() {
  if (!lbReady()) {
    app.innerHTML = `${topbar(t("Лидерборд"))}
      <div class="qcard">
        <div class="qtext">🏆 Общий лидерборд ещё не подключён.</div>
        <div class="why">Нужен бесплатный «бэкенд» — как в вашем «Ремонте»: <b>Google Таблица + Apps Script Web App</b>. Код готов в <b>backend/leaderboard.gs</b>, шаги — в <b>backend/SETUP-leaderboard.md</b>. Создаёте Таблицу → вставляете скрипт → Deploy → присылаете URL, я впишу его в <b>scriptUrl</b>. Никаких секретов в сайте.</div>
        <div class="src">Пока копите XP — после подключения результат попадёт в таблицу.</div>
        <button class="next" onclick="renderHome()">${t("В меню")}</button>
      </div>`;
    return;
  }
  const mode = lbMode;
  app.innerHTML = `${topbar(t("Лидерборд"))}<div class="qcard"><div class="qsub">Загрузка…</div></div>`;
  fetch(LEADERBOARD.scriptUrl + "?action=top").then(r => r.json()).then(rows => {
    rows = (Array.isArray(rows) ? rows : []).map(x => {
      const parts = String(x.username || "—").split(" ▪ ");
      return { name: parts[0].replace(/</g, ""), org: (parts[1] || "").replace(/</g, ""), score: +x.score || 0 };
    });
    const toggle = `<div class="lbtoggle">
      <button class="lbtab ${mode === "players" ? "on" : ""}" onclick="setLbMode('players')">👤 Игроки</button>
      <button class="lbtab ${mode === "teams" ? "on" : ""}" onclick="setLbMode('teams')">👥 Команды</button></div>`;
    let list;
    if (mode === "teams") {
      const teams = {};
      rows.forEach(r => { if (!r.org) return; if (!teams[r.org] || r.score > teams[r.org]) teams[r.org] = r.score; });
      const arr = Object.keys(teams).map(o => ({ org: o, score: teams[o] })).sort((a, b) => b.score - a.score).slice(0, 30);
      list = arr.map((x, i) =>
        `<div class="lbrow"><span class="lbpos">${i + 1}</span><span class="lbname">${x.org}</span><span class="lbscore">${x.score} XP</span></div>`).join("")
        || `<div class="qsub">Пока нет команд. Укажите аэропорт/организацию в «Настройках» и отправьте результат.</div>`;
    } else {
      list = rows.sort((a, b) => b.score - a.score).slice(0, 30).map((x, i) =>
        `<div class="lbrow"><span class="lbpos">${i + 1}</span><span class="lbname">${x.name}${x.org ? `<small class="lborg">${x.org}</small>` : ""}</span><span class="lbscore">${x.score} XP</span></div>`).join("")
        || `<div class="qsub">Пока пусто — будьте первым!</div>`;
    }
    app.innerHTML = `${topbar(t("Лидерборд"))}
      ${toggle}
      <div class="qcard"><div class="qsub">Топ-30</div>${list}</div>
      <button class="next" onclick="submitScore()">📤 Отправить мой результат (${state.xp} XP)</button>
      <button class="ghost fullrow" onclick="renderHome()">${t("В меню")}</button>`;
  }).catch(() => {
    app.innerHTML = `${topbar(t("Лидерборд"))}<div class="qcard"><div class="qtext">Не удалось загрузить лидерборд.</div><button class="next" onclick="renderHome()">${t("В меню")}</button></div>`;
  });
}
let lbMode = "players";
function setLbMode(m) { lbMode = m; renderLeaderboard(); }
function lbSubmitName() { const n = lbName(); return state.org ? (n + " ▪ " + state.org).slice(0, 48) : n; }
function submitScore() {
  if (!lbReady()) return;
  fetch(LEADERBOARD.scriptUrl, { method: "POST", body: JSON.stringify({ name: lbSubmitName(), score: state.xp }) })
    .then(r => r.json()).then(() => { toast("Результат отправлен 🏆"); renderLeaderboard(); })
    .catch(() => toast("Не удалось отправить"));
}

/* ---------- Сертификат ---------- */
function renderCertificate() {
  const rank = rankFor(state.xp);
  const xp = state.xp || 0;
  const correct = state.totalCorrect || 0;
  const streak = (state.daily && state.daily.streak) || 0;
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  app.innerHTML = `
    ${topbar("Сертификат")}
    <div class="cert-wrap">
      <div class="cert-card">
        <div class="cert-glow"></div>
        <div class="cert-emblem">✈</div>
        <div class="cert-kicker">CERTIFICATE OF COMPLETION</div>
        <h1 class="cert-title">AvEng — Aviation English</h1>
        <div class="cert-subtitle">Тренажёр радиофразеологии · ICAO Doc 4444 / 9432 / Annex 1</div>
        <div class="cert-divider"></div>
        <div class="cert-rank">
          <div class="cert-rank-name">${rank.name}</div>
          <div class="cert-rank-sub">${rank.sub || "уровень"}</div>
        </div>
        <div class="cert-stats">
          <div class="cert-stat"><div class="cert-stat-val">${xp}</div><div class="cert-stat-lbl">XP</div></div>
          <div class="cert-stat"><div class="cert-stat-val">${correct}</div><div class="cert-stat-lbl">верных ответов</div></div>
          <div class="cert-stat"><div class="cert-stat-val">${streak}</div><div class="cert-stat-lbl">дней подряд</div></div>
        </div>
        <div class="cert-footer">
          <div class="cert-date">${dateStr}</div>
          <div class="cert-sign">AvEng PWA</div>
        </div>
      </div>
      <div class="cert-actions">
        <button class="cert-btn cert-btn-primary" id="certDownloadBtn">⬇ Скачать PNG</button>
        <button class="cert-btn cert-btn-ghost" onclick="renderHome()">В меню</button>
      </div>
    </div>`;
  const btn = $("#certDownloadBtn");
  if (btn) btn.onclick = function () {
    const W = 1000, H = 700;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#06121a"); bg.addColorStop(.5, "#0b1f2a"); bg.addColorStop(1, "#0e2632"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const p = 40; rr(p, p, W - p * 2, H - p * 2, 28); const pan = ctx.createLinearGradient(0, p, 0, H - p); pan.addColorStop(0, "#0e2632"); pan.addColorStop(1, "#0b1f2a"); ctx.fillStyle = pan; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#27e0a0"; rr(p, p, W - p * 2, H - p * 2, 28); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(70,194,255,0.6)"; rr(p + 12, p + 12, W - (p + 12) * 2, H - (p + 12) * 2, 20); ctx.stroke();
    ctx.textAlign = "center"; const cx = W / 2;
    ctx.fillStyle = "#46c2ff"; ctx.font = "80px 'Segoe UI Emoji', system-ui, sans-serif"; ctx.fillText("✈", cx, 175);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "600 20px system-ui, sans-serif"; ctx.fillText("C E R T I F I C A T E   O F   C O M P L E T I O N", cx, 225);
    ctx.fillStyle = "#e8f4f8"; ctx.font = "700 46px system-ui, sans-serif"; ctx.fillText("AvEng — Aviation English", cx, 285);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "20px system-ui, sans-serif"; ctx.fillText("Тренажёр радиофразеологии · ICAO Doc 4444 / 9432 / Annex 1", cx, 322);
    ctx.strokeStyle = "rgba(39,224,160,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 120, 350); ctx.lineTo(cx + 120, 350); ctx.stroke();
    ctx.fillStyle = "#27e0a0"; ctx.font = "700 38px system-ui, sans-serif"; ctx.fillText(rank.name, cx, 410);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "20px system-ui, sans-serif"; ctx.fillText(rank.sub || "уровень", cx, 442);
    const stats = [[String(xp), "XP"], [String(correct), "верных ответов"], [String(streak), "дней подряд"]];
    const colW = (W - p * 2 - 60) / 3, sx = p + 30 + colW / 2, sy = 530;
    stats.forEach((s, i) => { const x = sx + i * colW; ctx.fillStyle = "#46c2ff"; ctx.font = "700 44px system-ui, sans-serif"; ctx.fillText(s[0], x, sy); ctx.fillStyle = "#8fb3c2"; ctx.font = "18px system-ui, sans-serif"; ctx.fillText(s[1], x, sy + 32); });
    ctx.fillStyle = "#e8f4f8"; ctx.font = "600 24px system-ui, sans-serif"; ctx.fillText(dateStr, cx, 630);
    ctx.fillStyle = "#8fb3c2"; ctx.font = "16px system-ui, sans-serif"; ctx.fillText("AvEng PWA", cx, 658);
    const a = document.createElement("a"); a.download = "AvEng-certificate.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
}

/* ---------- Настройки (голос, роль, звук) ---------- */
function renderSettings() {
  const noTTS = !("speechSynthesis" in window);
  const voices = enVoices();
  const opts = voices.map(v => `<option value="${v.voiceURI}" ${state.voiceURI === v.voiceURI ? "selected" : ""}>${v.name} (${v.lang})</option>`).join("");
  app.innerHTML = `${topbar("Настройки")}
    <div class="qcard">
      <div class="setrow">
        <div class="setlbl"><b>Звук</b><small>озвучка фраз и ответов</small></div>
        <button class="ghost" onclick="toggleSound(true)">${state.soundOn ? "🔊 Вкл" : "🔇 Выкл"}</button>
      </div>
      ${noTTS ? `
      <div class="setrow col">
        <div class="setlbl"><b>Озвучка</b><small>синтез речи</small></div>
        <small class="qsub">🔇 В Telegram озвучка недоступна — его встроенный браузер не поддерживает синтез речи. Для звука откройте AvEng в обычном браузере (Chrome/Safari). Текстовые режимы работают везде.</small>
      </div>` : `
      <div class="setrow col">
        <div class="setlbl"><b>Голос диктора (акцент)</b><small>для «На слух», алфавита, диалогов</small></div>
        ${voices.length
          ? `<select id="voicesel" class="select"><option value="">По умолчанию</option>${opts}</select>`
          : `<small class="qsub">Голоса ещё не загрузились — нажмите «Проверить голос» и вернитесь.</small>`}
      </div>
      <button class="listen" onclick="speak('Tajik one zero one, cleared to land runway two seven.', 'en-US', {force:true})">▶ Проверить голос</button>`}
      <div class="setrow col">
        <div class="setlbl"><b>Трек обучения</b><small>пока активен «Диспетчер»</small></div>
        <div class="roles">
          ${["controller", "pilot", "cabin", "airport"].map(rk => `<button class="rolechip ${state.role === rk ? "on" : ""}" onclick="setRole('${rk}', true)">${t(ROLE_NAMES[rk])}</button>`).join("")}
        </div>
      </div>
      <div class="setrow col">
        <div class="setlbl"><b>Аэропорт / организация</b><small>для командного лидерборда (напр. DYU, Душанбе)</small></div>
        <input id="orgInput" class="select" type="text" maxlength="24" placeholder="напр. DYU" value="${(state.org || "").replace(/"/g, "&quot;")}">
      </div>
    </div>`;
  const oi = $("#orgInput");
  if (oi) oi.addEventListener("change", () => { state.org = oi.value.trim().slice(0, 24); save(); toast("Сохранено"); });
  const sel = $("#voicesel");
  if (sel) sel.addEventListener("change", () => { state.voiceURI = sel.value; save(); });
  if (!voices.length && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      const tt = $(".ttitle");
      if (tt && tt.textContent === "Настройки") renderSettings();
    };
  }
}

function setRole(rk, fromSettings) {
  state.role = rk; save();
  if (fromSettings) renderSettings(); else renderHome();
}

function toggleSound(stay) { state.soundOn = !state.soundOn; save(); stay ? renderSettings() : renderHome(); }
function resetAll() {
  if (confirm("Сбросить весь прогресс, XP и ачивки?")) {
    localStorage.removeItem(SAVE_KEY);
    Object.assign(state, defaultState());
    renderHome();
    toast("Прогресс сброшен");
  }
}

/* ===========================================================================
   TELEGRAM MINI APP (всё под защитой — в обычном браузере не мешает)
   =========================================================================== */
const TG = (window.Telegram && window.Telegram.WebApp) || null;
const inTelegram = !!(TG && TG.platform && TG.platform !== "unknown");
function tgBack(show) { if (!inTelegram) return; try { show ? TG.BackButton.show() : TG.BackButton.hide(); } catch (e) {} }
function tgHaptic(type) { if (!inTelegram) return; try { TG.HapticFeedback.notificationOccurred(type); } catch (e) {} }
function tgShare() {
  track("share/invite");
  const link = "https://t.me/AvEngApp_bot?startapp=inv";
  if (inTelegram) {
    try { TG.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent("AvEng — тренажёр авиационного английского ✈️")); return; } catch (e) {}
  }
  if (navigator.share) navigator.share({ title: "AvEng", url: link }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast("Ссылка скопирована")).catch(() => {});
}

/* ===========================================================================
   ШАРИНГ КАРТИНКОЙ · ВЫЗОВЫ · КОНФЕТТИ
   =========================================================================== */
const BOT_LINK = "https://t.me/AvEngApp_bot";
const WEB_LINK = "https://bsheraliev.github.io/atc-english/";
function challengeLink(seed) { return BOT_LINK + "?startapp=ch_" + seed; }
function newSeed() { return (hashSeed(lbName() + "|" + Date.now() + "|" + Math.random()) >>> 0).toString(36).slice(0, 8); }

/* Рисуем красивую квадратную карточку результата (для соцсетей/Telegram) */
function makeShareCanvas(pct, correct, total, lvl) {
  const S = 1080;
  const c = document.createElement("canvas"); c.width = S; c.height = S;
  const ctx = c.getContext("2d");
  const cx = S / 2;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const bg = ctx.createLinearGradient(0, 0, S, S); bg.addColorStop(0, "#06121a"); bg.addColorStop(.5, "#0b1f2a"); bg.addColorStop(1, "#0e2632"); ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  const p = 56; ctx.lineWidth = 3; ctx.strokeStyle = "#27e0a0"; rr(p, p, S - p * 2, S - p * 2, 40); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#46c2ff"; ctx.font = "120px 'Segoe UI Emoji', system-ui, sans-serif"; ctx.fillText("✈", cx, 250);
  ctx.fillStyle = "#e8f4f8"; ctx.font = "800 64px system-ui, sans-serif"; ctx.fillText("AvEng", cx, 330);
  ctx.fillStyle = "#8fb3c2"; ctx.font = "28px system-ui, sans-serif"; ctx.fillText("Aviation English · ICAO Doc 4444 / 9432", cx, 375);
  const good = pct >= 70;
  ctx.fillStyle = good ? "#27e0a0" : "#ffc14d"; ctx.font = "800 220px system-ui, sans-serif"; ctx.fillText(pct + "%", cx, 620);
  ctx.fillStyle = "#e8f4f8"; ctx.font = "600 40px system-ui, sans-serif"; ctx.fillText("Правильно " + correct + " из " + total, cx, 695);
  rr(cx - 230, 740, 460, 96, 24); ctx.fillStyle = "rgba(70,194,255,0.12)"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#46c2ff"; rr(cx - 230, 740, 460, 96, 24); ctx.stroke();
  ctx.fillStyle = "#46c2ff"; ctx.font = "700 44px system-ui, sans-serif"; ctx.fillText("ICAO Level " + lvl, cx, 803);
  ctx.fillStyle = "#27e0a0"; ctx.font = "700 38px system-ui, sans-serif"; ctx.fillText("Сможешь побить? ⚔️", cx, 930);
  ctx.fillStyle = "#8fb3c2"; ctx.font = "32px system-ui, sans-serif"; ctx.fillText("@AvEngApp_bot", cx, 985);
  return c;
}
async function shareResult(pct, correct, total, lvl) {
  track("share/result");
  const c = makeShareCanvas(pct, correct, total, lvl);
  const txt = "Я набрал " + pct + "% в AvEng — тренажёре авиационного английского ✈️ Сможешь побить?";
  try {
    if (navigator.canShare) {
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      const file = new File([blob], "AvEng-result.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: txt + " " + BOT_LINK }); return; }
    }
  } catch (e) {}
  // Фолбэк: сохраняем картинку + предлагаем переслать ссылку
  try { const a = document.createElement("a"); a.download = "AvEng-result.png"; a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); document.body.removeChild(a); toast("Картинка сохранена — отправьте её коллегам"); } catch (e) {}
  if (inTelegram) { try { TG.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(BOT_LINK) + "&text=" + encodeURIComponent(txt)); } catch (e) {} }
}

/* Бросить вызов: общий набор из 10 вопросов по seed — у обоих одинаковые */
function startChallenge() {
  track("share/challenge");
  const seed = newSeed();
  const link = challengeLink(seed);
  const cap = "⚔️ Вызов в AvEng — 10 вопросов авиационного английского. Сможешь побить мой счёт?";
  if (inTelegram) { try { TG.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(cap)); return; } catch (e) {} }
  if (navigator.share) { navigator.share({ title: "AvEng — вызов", text: cap, url: link }).catch(() => {}); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(link).then(() => toast("Ссылка на вызов скопирована")).catch(() => {}); }
}
function renderChallengeIntro(seed) {
  app.innerHTML = `${topbar("Вызов ⚔️")}
    <div class="qcard">
      <div class="qtext">⚔️ Тебе бросили вызов!</div>
      <div class="why">10 вопросов по авиационному английскому (ICAO Doc 4444 / 9432). У тебя и у того, кто бросил вызов — <b>одинаковый набор вопросов</b>. Пройди и сравните счёт.</div>
      <button class="next" onclick="startChallengeRun('${seed}')">Принять вызов →</button>
      <button class="ghost fullrow" onclick="renderHome()">Позже</button>
    </div>`;
}
function startChallengeRun(seed) {
  const pool = DATA.quiz.filter(q => q.cat !== "lpr");
  startQuiz(seededPick(pool, 10, seed), "Вызов ⚔️", null, { challenge: seed });
}

function confetti() {
  try {
    const colors = ["#27e0a0", "#46c2ff", "#ffc14d", "#ff6b6b", "#e8f4f8"];
    const wrap = document.createElement("div"); wrap.className = "confetti";
    for (let i = 0; i < 30; i++) {
      const s = document.createElement("i");
      s.style.left = (Math.random() * 100) + "vw";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 0.35) + "s";
      s.style.animationDuration = (1.6 + Math.random() * 0.9) + "s";
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2600);
  } catch (e) {}
}

/* ===========================================================================
   ПРОБНЫЙ ЭКЗАМЕН ELPET / TEA — формат, приближённый к реальному, по 6 критериям LPR.
   Понимание (Comprehension) — автоматически (аудио + выбор ответа); продуктивные
   критерии — честная самооценка по официальным дескрипторам ИКАО. Итог = наименьший
   из шести (правило ИКАО), рабочий минимум — Level 4. Это тренажёр, НЕ аттестация.
   =========================================================================== */
const LPR_CRIT = [
  { key: "pron", name: "Произношение", icon: "🗣️", auto: false, lv: {
    3: "Акцент часто мешает пониманию", 4: "Акцент иногда мешает пониманию",
    5: "Акцент редко мешает пониманию", 6: "Акцент почти никогда не мешает" } },
  { key: "struct", name: "Грамматика", icon: "🔧", auto: false, lv: {
    3: "Базовые конструкции нестабильны, ошибки часто искажают смысл",
    4: "Базовые конструкции под контролем; ошибки редко искажают смысл",
    5: "Базовые — стабильно; сложные — с отдельными ошибками",
    6: "И базовые, и сложные конструкции стабильно верны" } },
  { key: "vocab", name: "Словарный запас", icon: "📚", auto: false, lv: {
    3: "Запас ограничен, слова часто неточны; перефразировать трудно",
    4: "Запаса обычно хватает; может перефразировать в нестандартной ситуации",
    5: "Запас широкий и точный; уверенно перефразирует, иногда идиомы",
    6: "Богатый идиоматичный запас на любые темы" } },
  { key: "flu", name: "Беглость", icon: "💨", auto: false, lv: {
    3: "Паузы и заминки часто мешают общению",
    4: "Темп в целом нормальный; сбои при спонтанной речи не мешают",
    5: "Говорит свободно на знакомые темы, уместные связки",
    6: "Естественная лёгкая речь, варьирует темп как приём" } },
  { key: "comp", name: "Понимание на слух", icon: "👂", auto: true, lv: {
    3: "Понимает рутину; сбои при осложнениях",
    4: "Понимает рутину; при осложнении — медленнее или нужно уточнение",
    5: "Понимает рутину и осложнения, разные акценты",
    6: "Понимает практически всё, включая нюансы" } },
  { key: "inter", name: "Взаимодействие", icon: "🔁", auto: false, lv: {
    3: "Реагирует на знакомое; теряется при неожиданном",
    4: "Реагирует быстро и по делу даже при неожиданном; уточняет",
    5: "Реакции немедленные и точные, ведёт диалог",
    6: "Свободно в любой ситуации, чуток к собеседнику" } }
];
function elpetCompLevel(pct) { if (pct >= 95) return 6; if (pct >= 85) return 5; if (pct >= 70) return 4; if (pct >= 50) return 3; return 2; }

let elpet = null;
function buildElpetSteps() {
  const E = DATA.elpet, steps = [];
  steps.push({ type: "part", n: "I", title: "Часть I · Устное собеседование", sub: "Расскажите о себе и работе. Отвечайте развёрнуто, полными фразами — это ваша продуктивная речь." });
  pick(E.interview, 3).forEach(q => steps.push({ type: "speak", prompt: q }));
  steps.push({ type: "part", n: "II.1", title: "Часть II · Раздел 1 · Интерактивное понимание", sub: "Вы услышите сообщения пилотов. Ответьте так, как на рабочем месте — выберите верный ответ." });
  E.messages.forEach(m => steps.push({ type: "listen", m }));
  steps.push({ type: "part", n: "II.2", title: "Часть II · Раздел 2 · Нестандартные ситуации", sub: "Прослушайте радиообмен, поймите суть, затем выберите верный доклад и ответ на вопрос." });
  E.nonroutine.forEach(s => { steps.push({ type: "scReport", s }); steps.push({ type: "scFollow", s }); });
  steps.push({ type: "part", n: "III", title: "Часть III · Беседа по фото и темам", sub: "Опишите изображение и порассуждайте на тему. Снова — продуктивная речь." });
  pick(E.topics, 2).forEach(tp => steps.push({ type: "speak", scene: tp.scene, prompt: tp.prompt }));
  steps.push({ type: "self" });
  return steps;
}
function startElpet() { elpet = { steps: buildElpetSteps(), i: 0, comp: { c: 0, t: 0 }, self: {} }; renderElpetStep(); }
function elpetNext() { elpet.i++; renderElpetStep(); }
function elpetHud() { const tot = elpet.steps.length; return `<div class="hud"><span>Шаг ${Math.min(elpet.i + 1, tot)}/${tot}</span><span class="streak">📋 ELPET</span></div>`; }
function elpetPlay() {
  const s = elpet.steps[elpet.i]; let txt = "";
  if (s.type === "listen") txt = s.m.audio;
  else if (s.type === "scReport" || s.type === "scFollow") txt = s.s.exchange.map(l => l.text).join(" ... ");
  if (txt) speak(txt, "en-US", { force: true });
}
function renderElpetStep() {
  if (!elpet || elpet.i >= elpet.steps.length) return renderElpetResult();
  const s = elpet.steps[elpet.i];
  if (s.type === "part") return renderElpetPart(s);
  if (s.type === "speak") return renderElpetSpeak(s);
  if (s.type === "listen") return renderElpetListen(s);
  if (s.type === "scReport") return renderElpetScenario(s, false);
  if (s.type === "scFollow") return renderElpetScenario(s, true);
  if (s.type === "self") return renderElpetSelf();
}
function renderElpetPart(s) {
  app.innerHTML = `${topbar("Экзамен ELPET")}${elpetHud()}
    <div class="qcard">
      <div class="partbadge">${s.n}</div>
      <div class="qtext">${s.title}</div>
      <div class="why">${s.sub}</div>
      <button class="next" onclick="elpetNext()">Начать →</button>
    </div>`;
}
function renderElpetSpeak(s) {
  const rec = hasSR()
    ? `<button class="listen" onclick="elpetRec('elpetHeard')">🎤 Записать ответ (по желанию)</button><div class="why" id="elpetHeard"></div>`
    : `<div class="src">🎤 Запись речи недоступна в этой среде — проговорите ответ вслух.</div>`;
  app.innerHTML = `${topbar("Экзамен ELPET")}${elpetHud()}
    <div class="qcard">
      ${s.scene ? `<div class="scene">🖼️ ${s.scene}</div>` : ""}
      <div class="qtext">${s.prompt}</div>
      <div class="src">Говорите вслух 30–60 секунд, развёрнуто. Это влияет на самооценку продуктивных критериев в конце.</div>
      ${rec}
      <button class="next" onclick="elpetNext()">Готово →</button>
    </div>`;
}
function elpetRec(outId) {
  if (!hasSR()) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const out = $("#" + outId);
  let r; try { r = new SR(); } catch (e) { return; }
  r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
  if (out) out.textContent = "🎙️ Слушаю… говорите.";
  r.onresult = e => { const tx = e.results[0][0].transcript; const w = tx.trim().split(/\s+/).filter(Boolean).length; if (out) out.innerHTML = "Распознано (" + w + " слов): «" + tx.replace(/</g, "") + "»"; };
  r.onerror = () => { if (out) out.textContent = "Не удалось распознать (нет доступа к микрофону)."; };
  try { r.start(); } catch (e) {}
}
function renderElpetListen(s) {
  const m = s.m;
  app.innerHTML = `${topbar("Экзамен ELPET")}${elpetHud()}
    <div class="qcard">
      <div class="callsign">✈️ ${m.callsign}</div>
      <button class="listen" onclick="elpetPlay()">▶ Прослушать сообщение</button>
      <button class="ghost fullrow" onclick="this.nextElementSibling.style.display='block';this.style.display='none'">Показать текст</button>
      <div class="transcript" style="display:none">«${m.audio}»</div>
      <div class="qtext">${m.q}</div>
      <div class="opts">${m.a.map((t, idx) => `<button class="opt" data-i="${idx}">${t}</button>`).join("")}</div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => elpetAnswer(parseInt(b.dataset.i), b, m.correct, m.why)));
  if (state.soundOn) speak(m.audio, "en-US", { force: true });
}
function renderElpetScenario(s, follow) {
  const sc = s.s;
  const qtext = follow ? sc.followQ : sc.reportQ;
  const opts = follow ? sc.followA : sc.a;
  const correct = follow ? sc.followCorrect : sc.correct;
  const why = follow ? sc.followWhy : sc.why;
  const exchange = sc.exchange.map(l => `<div class="exline"><b>${l.who}:</b> ${l.text}</div>`).join("");
  app.innerHTML = `${topbar("Экзамен ELPET")}${elpetHud()}
    <div class="qcard">
      <div class="callsign">⚠️ ${sc.title}</div>
      <button class="listen" onclick="elpetPlay()">▶ Прослушать радиообмен</button>
      <div class="exchange">${exchange}</div>
      <div class="qtext">${qtext}</div>
      <div class="opts">${opts.map((t, idx) => `<button class="opt" data-i="${idx}">${t}</button>`).join("")}</div>
      <div class="feedback" id="fb"></div>
    </div>`;
  $$(".opt").forEach(b => b.addEventListener("click", () => elpetAnswer(parseInt(b.dataset.i), b, correct, why)));
}
function elpetAnswer(chosen, btn, correct, why) {
  const fb = $("#fb"); if (fb.dataset.locked) return; fb.dataset.locked = "1";
  const ok = chosen === correct;
  beep(ok); tgHaptic(ok ? "success" : "error");
  elpet.comp.t++; if (ok) { elpet.comp.c++; addXP(8); }
  markDaily();
  $$(".opt").forEach(b => { const i = parseInt(b.dataset.i); b.disabled = true; if (i === correct) b.classList.add("right"); else if (b === btn) b.classList.add("wrong"); });
  fb.innerHTML = `<div class="fb ${ok ? "ok" : "no"}">${ok ? "✅ Верно +8 XP" : "❌ Неверно"}</div><div class="why">${why}</div><button class="next" id="next">Дальше →</button>`;
  $("#next").addEventListener("click", elpetNext);
}
function renderElpetSelf() {
  const crits = LPR_CRIT.filter(c => !c.auto);
  const rows = crits.map(c => `
    <div class="selfcrit">
      <div class="selflbl">${c.icon} ${c.name}</div>
      <div class="selflevels">${[3, 4, 5, 6].map(L => `<button class="lvbtn ${elpet.self[c.key] === L ? "on" : ""}" data-k="${c.key}" data-l="${L}">${L}</button>`).join("")}</div>
      <div class="selfdesc" id="desc_${c.key}">${elpet.self[c.key] ? c.lv[elpet.self[c.key]] : "Выберите уровень, который честно описывает вашу речь"}</div>
    </div>`).join("");
  app.innerHTML = `${topbar("Экзамен ELPET")}${elpetHud()}
    <div class="qcard">
      <div class="qtext">Самооценка продуктивных критериев</div>
      <div class="why">Понимание на слух уже оценено автоматически. Остальные 5 критериев оцените честно по дескрипторам ИКАО. Итог = наименьший из шести (правило ИКАО), рабочий минимум — Level 4.</div>
      ${rows}
      <button class="next" id="elpetDone">Показать результат →</button>
    </div>`;
  $$(".lvbtn").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.k, L = parseInt(b.dataset.l);
    elpet.self[k] = L;
    $$(`.lvbtn[data-k="${k}"]`).forEach(x => x.classList.toggle("on", x === b));
    const d = $("#desc_" + k), c = LPR_CRIT.find(x => x.key === k); if (d) d.textContent = c.lv[L];
  }));
  $("#elpetDone").addEventListener("click", () => {
    if (crits.some(c => !elpet.self[c.key])) { toast("Оцените все 5 критериев"); return; }
    renderElpetResult();
  });
}
function renderElpetResult() {
  const pct = elpet.comp.t ? Math.round(elpet.comp.c / elpet.comp.t * 100) : 0;
  const compL = elpetCompLevel(pct);
  const levels = LPR_CRIT.map(c => c.auto ? { c, L: compL } : { c, L: elpet.self[c.key] || 4 });
  const overall = Math.min.apply(null, levels.map(x => x.L));
  const oc = overall >= 4 ? "ok" : "no";
  const rows = levels.map(x => `
    <div class="scoreRow">
      <span class="scName">${x.c.icon} ${x.c.name}${x.c.auto ? " <small>(авто)</small>" : ""}</span>
      <span class="scLv lv${x.L}">L${x.L}</span>
      <span class="scDesc">${x.c.lv[x.L] || ""}</span>
    </div>`).join("");
  app.innerHTML = `${topbar("Результат ELPET")}
    <div class="result">
      <div class="bigpct ${oc}">Level ${overall}</div>
      <div class="verdict ${oc}">${overall >= 5 ? "Extended — выше рабочего уровня" : overall >= 4 ? "Operational — рабочий уровень ИКАО достигнут" : "Ниже рабочего уровня (нужен Level 4)"}</div>
      <div class="lprbadge ${oc}">Итог = наименьший из 6 критериев (правило ИКАО)<small>Понимание: ${elpet.comp.c}/${elpet.comp.t} (${pct}%) авто · остальное — самооценка · тренажёр, не аттестация</small></div>
    </div>
    <div class="qcard scoreCard">
      <div class="brtitle">Карта по 6 критериям LPR</div>
      ${rows}
    </div>
    <div class="row2">
      <button class="primary" onclick="shareResult(${pct}, ${elpet.comp.c}, ${elpet.comp.t}, '${overall}')">📲 Поделиться</button>
      <button class="ghost" onclick="startElpet()">↻ Заново</button>
    </div>
    <button class="ghost fullrow" onclick="renderHome()">В меню</button>`;
  if (oc === "ok") confetti();
  save();
}

/* ---------- Старт ---------- */
let pendingChallenge = null;
function detectChallenge() {
  try {
    const m = (location.search || "").match(/[?&]ch=([a-z0-9]+)/i);
    if (m) pendingChallenge = m[1];
  } catch (e) {}
  try {
    const sp = inTelegram && TG.initDataUnsafe && TG.initDataUnsafe.start_param;
    if (sp && /^ch_[a-z0-9]+$/i.test(sp)) pendingChallenge = sp.slice(3);
  } catch (e) {}
}
function home() {
  if (pendingChallenge) { const s = pendingChallenge; pendingChallenge = null; return renderChallengeIntro(s); }
  renderHome();
}
function startApp() {
  initAnalytics(); track("app-open"); trackSource();
  if (inTelegram) {
    try {
      TG.ready(); TG.expand();
      if (TG.setBackgroundColor) TG.setBackgroundColor("#06121a");
      if (TG.setHeaderColor) TG.setHeaderColor("#06121a");
      if (TG.disableVerticalSwipes) TG.disableVerticalSwipes();
      TG.BackButton.onClick(() => renderHome());
    } catch (e) {}
    detectChallenge();
    lbRegister();
    try {
      TG.CloudStorage.getItem(SAVE_KEY, (err, val) => {
        if (!err && val) { try { const cloud = JSON.parse(val); if ((cloud.xp || 0) > (state.xp || 0)) Object.assign(state, defaultState(), cloud); } catch (e) {} }
        home();
      });
      return;
    } catch (e) {}
  }
  detectChallenge();
  home();
}
startApp();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
