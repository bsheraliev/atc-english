/* ===========================================================================
   AvEng — сборка защиты «демо + лицензия» (как в AvSec).
   Из мастер-файла data.src.js (локальный, не публикуется) делает:
     • data.js         — ПУБЛИЧНЫЙ пробник: радиоалфавит/числа (ИКАО-стандарт),
                         ранги/ачивки и SAMPLE_CATS квиза; остальное закрыто
     • data.full.enc   — ПУБЛИЧНЫЙ шифр полной IP (AES-256-GCM): полный quiz +
                         dialogues + listening + elpet; без ключа бесполезен
     • .aveng-fullkey  — сохранённый ключ AES (gitignore). Его вставить в ОБЩИЙ
                         GAS-бэкенд как AVENG_KEY (тот же, что у AvSec, app=aveng).
   Полный открытый текст платного контента в публичный репозиторий не попадает.
   Запуск:  node build.mjs
   =========================================================================== */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.join(ROOT, "data.src.js");

/* --- Пробник: какие категории quiz отдаём публично (витрина). Меняйте набор. --- */
const SAMPLE_CATS  = ["phraseology", "standard", "numbers"];       // ~51 вопрос из 187
/* Режимы, закрытые в демо (читают платные массивы dialogues/listening/elpet). --- */
const GATED_MODES  = ["listening", "pron", "dialogues", "scenario", "elpet"];
const SAMPLE_KEY   = "AvEng-demo-2026";                             // ключ пробника — не секрет

/* --- Ключ полной базы (AES-256, 32 байта). Секрет, стабилен между сборками. --- */
const KEY_FILE = path.join(ROOT, ".aveng-fullkey");
let FULL_KEY;
if (process.env.AVENG_KEY) FULL_KEY = Buffer.from(process.env.AVENG_KEY, "base64");
else if (fs.existsSync(KEY_FILE)) FULL_KEY = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "base64");
else { FULL_KEY = crypto.randomBytes(32); fs.writeFileSync(KEY_FILE, FULL_KEY.toString("base64"), "utf8"); }
const FULL_KEY_B64 = FULL_KEY.toString("base64");

function xorEnc(jsonStr, key) {
  const bytes = Buffer.from(jsonStr, "utf8"), kb = Buffer.from(key, "utf8");
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= kb[i % kb.length];
  return bytes.toString("base64");
}
function aesEnc(jsonStr, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(jsonStr, "utf8")), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}

if (!fs.existsSync(SRC)) { console.error("НЕТ data.src.js рядом с build.mjs"); process.exit(1); }
const DATA = Function(fs.readFileSync(SRC, "utf8").replace(/const\s+DATA\s*=/, "return "))();
const totalQuiz = DATA.quiz.length;

/* --- Пробник → data.js (публичное всегда: alphabet/numbers/ranks/achievements + sample quiz) --- */
const sampleQuiz = DATA.quiz.filter(q => SAMPLE_CATS.includes(q.cat));
const demo = {
  alphabet: DATA.alphabet, numbers: DATA.numbers,
  ranks: DATA.ranks, achievements: DATA.achievements,
  quiz: sampleQuiz,
  dialogues: [], listening: [], elpet: { interview: [], messages: [], nonroutine: [], topics: [] }
};
const sampleEnc = xorEnc(JSON.stringify(demo), SAMPLE_KEY);
const dataJs =
`/* AvEng — ПУБЛИЧНЫЙ пробник (${sampleQuiz.length} из ${totalQuiz} вопросов + радиоалфавит). Полный курс — по лицензии организации.
   Контент защищён авторским правом (см. LICENSE). Мастер для правок — локальный data.src.js (не публикуется). */
var _D="${sampleEnc}";
var DATA=(function(k){var b=atob(_D),a=new Uint8Array(b.length),i;for(i=0;i<b.length;i++)a[i]=b.charCodeAt(i);var kb=new TextEncoder().encode(k);for(i=0;i<a.length;i++)a[i]^=kb[i%kb.length];return JSON.parse(new TextDecoder().decode(a));})("${SAMPLE_KEY}");
var SAMPLE_CATS=${JSON.stringify(SAMPLE_CATS)};
var GATED_MODES=${JSON.stringify(GATED_MODES)};
`;
fs.writeFileSync(path.join(ROOT, "data.js"), dataJs, "utf8");

/* --- Полная IP → публичный шифр data.full.enc (AES) --- */
const full = { quiz: DATA.quiz, dialogues: DATA.dialogues, listening: DATA.listening, elpet: DATA.elpet };
const fullEnc = aesEnc(JSON.stringify(full), FULL_KEY);
fs.writeFileSync(path.join(ROOT, "data.full.enc"), fullEnc, "utf8");

console.log("✔ data.js — пробник:", sampleQuiz.length, "вопр. (темы:", SAMPLE_CATS.join(", ") + ") + алфавит/числа");
console.log("✔ data.full.enc — полная IP: quiz", totalQuiz + ", dialogues", DATA.dialogues.length + ", listening", DATA.listening.length + ", elpet; AES-256-GCM,", Math.round(fullEnc.length / 1024), "КБ");
console.log("✔ Ключ AES (base64) — вставьте в ОБЩИЙ GAS как AVENG_KEY:", FULL_KEY_B64);
