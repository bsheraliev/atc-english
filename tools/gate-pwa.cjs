// Ворота PWA (2026-11-15): автоматическая проверка перед слиянием — iPhone-риски + ключи в коде.
// Источник: scan-pwa-iphone.js (урок Ш-2 Shohin) + технический гейт SECURITY-PRELAUNCH (claude-plan).
// Запуск: node tools/gate-pwa.cjs [папка=.]   Код выхода 1 — есть ошибка (X), предупреждения (!) не валят.
// Нужен пакет acorn: в GitHub Actions ставится шагом `npm i --no-save acorn@8`.
// Мастер-копия: C:\Users\user\Claude\Projects\_Общее\tools\gate-pwa.cjs — правки вносить там и копировать в репозитории.
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let acorn;
try { acorn = require('acorn'); } catch (e) { acorn = require('C:/Repos/second-brain-node/node_modules/acorn'); }

const R = path.resolve(process.argv[2] || '.');
const rd = f => fs.readFileSync(path.join(R, f), 'utf8');
let fails = 0, warns = 0;
const X = m => { fails++; console.log('  X ' + m); };
const W = m => { warns++; console.log('  ! ' + m); };
const walk = (n, cb) => { if (!n || typeof n.type !== 'string') return; cb(n); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, cb)); else if (v && typeof v.type === 'string') walk(v, cb); } };

const idx = rd('index.html');
const JS = [...idx.matchAll(/<script\b[^>]*\bsrc="\.?\/?([^"?#:]+\.js)[^"]*"/g)].map(m => m[1]).filter(f => fs.existsSync(path.join(R, f)));
console.log('скрипты:', JS.join(', '));

console.log('\n1) Синтаксис и старый Safari (iOS < 16.4)');
const RISK = new Set('head body tg title header footer main nav form el row go render name status top parent self length origin event t'.split(' '));
const asts = {};
for (const f of JS) {
  try { new vm.Script(rd(f)); } catch (e) { X(`${f}: синтаксис — ${e.message}`); continue; }
  const ast = asts[f] = acorn.parse(rd(f), { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  walk(ast, n => {
    let w = null;
    if (n.type === 'Literal' && n.regex && /\(\?<[=!]/.test(n.regex.pattern)) w = 'regex lookbehind (iOS 16.4+)';
    if (n.type === 'StaticBlock') w = 'class static {} (iOS 16.4+)';
    if (n.type === 'MemberExpression' && !n.computed && ['findLast', 'findLastIndex', 'toSorted', 'toReversed', 'toSpliced', 'groupBy'].includes(n.property.name)) w = '.' + n.property.name + ' (iOS 15.4+/16+)';
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'at' && n.object.type !== 'ThisExpression') w = '.at() (iOS 15.4+)';
    if (n.type === 'Identifier' && n.name === 'structuredClone') w = 'structuredClone (iOS 15.4+)';
    if (w) X(`${f}:${n.loc.start.line} ${w}`);
  });
}

console.log('\n2) Глобальные имена (Telegram на iPhone подменяет var/function с общими именами)');
for (const f of Object.keys(asts)) for (const n of asts[f].body) {
  const chk = (kind, nm, L) => { if (RISK.has(nm) && (kind === 'var' || kind === 'function')) X(`${f}:${L} ${kind} ${nm} — подменяемо; объявить const или убрать в IIFE`); };
  if (n.type === 'FunctionDeclaration') chk('function', n.id.name, n.loc.start.line);
  else if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') chk(n.kind, d.id.name, d.loc.start.line);
}

console.log('\n3) Ошибка видна на экране, облако Telegram не держит меню');
const all = JS.map(rd).join('\n');
if (!/addEventListener\(\s*["']error["']|onerror\s*=\s*(function|\()/.test(all.replace(/\w+\.onerror\s*=/g, ''))) X('нет глобального перехвата ошибок — при сбое пустой экран');
const m = all.match(/CloudStorage\.getItem\([\s\S]{0,400}/);
if (m && !/setTimeout/.test(all.slice(Math.max(0, all.indexOf(m[0]) - 300), all.indexOf(m[0]) + 400))) X('CloudStorage.getItem без запасного таймера');

console.log('\n4) Иконка iPhone и офлайн-кэш');
const apple = (idx.match(/rel="apple-touch-icon"[^>]*href="\.?\/?([^"]+)"|href="\.?\/?([^"]+)"[^>]*rel="apple-touch-icon"/) || []).slice(1).find(Boolean);
if (!apple) W('apple-touch-icon не задан'); else if (!fs.existsSync(path.join(R, apple))) X(`apple-touch-icon ${apple}: файла нет`);
if (fs.existsSync(path.join(R, 'sw.js'))) {
  const assets = [...rd('sw.js').matchAll(/["']\.\/([^"']+)["']/g)].map(x => x[1]).filter(Boolean);
  for (const a of assets) if (!fs.existsSync(path.join(R, a.split('?')[0]))) X(`sw.js кэширует ${a}, а файла нет`);
  const loaded = [...idx.matchAll(/(?:src|href)="\.?\/?([^"?#:]+\.(?:js|css|webmanifest|svg|png))[^"]*"/g)].map(x => x[1]);
  const miss = loaded.filter(l => !assets.includes(l)); if (miss.length) W('не в офлайн-кэше: ' + miss.join(', '));
}

console.log('\n5) Ключи и закрытые файлы в репозитории');
let files;
try { files = cp.execSync('git ls-files', { cwd: R, encoding: 'utf8' }).split('\n').filter(Boolean); }
catch (e) { files = []; W('не git-репозиторий — проверка файлов пропущена'); }
const FORBIDDEN = [/(^|\/)\.[\w-]*fullkey$/, /(^|\/)data\.src\.js$/, /(^|\/)data\.procs\.src\.js$/, /(^|\/)backend\/_generated\//, /^xray\/.*\.(jpe?g|png|webp|gif|bmp|tiff?)$/i, /(^|\/)xray\/scenes\.json$/, /(^|\/)\.env(\.|$)/, /\.(pem|p12|pfx|key)$/i];
const SECRET = [
  [/AIza[0-9A-Za-z_-]{35}/, 'ключ Google API'],
  [/\b\d{8,10}:AA[0-9A-Za-z_-]{33}\b/, 'токен Telegram-бота'],
  [/\bgsk_[0-9A-Za-z]{40,}/, 'ключ Groq'],
  [/\bsk-ant-[0-9A-Za-z_-]{20,}/, 'ключ Anthropic'],
  [/\bsk-(proj-)?[0-9A-Za-z]{32,}/, 'ключ OpenAI'],
  [/\bgh[pousr]_[0-9A-Za-z]{36}\b/, 'токен GitHub'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'закрытый ключ'],
  [/\b(FULL_KEY|[A-Z]+_FULLKEY)\s*=\s*["'][A-Za-z0-9+/]{43}=["']/, 'ключ AES полной базы'],
];
for (const f of files) {
  if (FORBIDDEN.some(r => r.test(f))) { X(`${f}: закрытый файл в репозитории`); continue; }
  if (/\.(enc|png|jpe?g|webp|gif|ico|mp3|ogg|wav|mp4|zip|pdf|woff2?)$/i.test(f)) continue;   // двоичные и шифр — мимо
  let s; try { s = fs.readFileSync(path.join(R, f), 'utf8'); } catch (e) { continue; }
  s.split('\n').forEach((line, i) => {
    if (line.length > 20000) return;                                                         // сгенерированные base64-блоки
    for (const [re, what] of SECRET) if (re.test(line)) X(`${f}:${i + 1} похоже на ${what}`);
  });
}

console.log(`\nИтог: ошибок ${fails}, предупреждений ${warns}`);
process.exit(fails ? 1 : 0);
