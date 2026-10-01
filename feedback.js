/* Кнопка «Сообщить об ошибке» для наших PWA без своего сервера (тренажёры, порталы).
 * Эталон лежит в репозитории Рақам: apps/shared/feedback.js. В каждое приложение копируется как есть,
 * подключается одной строкой перед </body>:
 *   <script src="feedback.js" data-app="avsec" data-version="v25" defer></script>
 * data-app — короткий слаг приложения (латиница), data-version — версия, которую видит пользователь.
 * Обращение уходит в ядро Рақам (POST /api/app-feedback) и становится закрытой карточкой — не в публичные Issues.
 * Зависимостей нет; свои стили под префиксом .fbk-; язык берётся из <html lang>: ru | tg | en.
 */
(function () {
  'use strict';
  var me = document.currentScript || document.querySelector('script[data-app][src$="feedback.js"]');
  var APP = (me && me.getAttribute('data-app')) || '';
  var VER = (me && me.getAttribute('data-version')) || '';
  var URL = (me && me.getAttribute('data-url')) || 'https://raqam-core.onrender.com/api/app-feedback';
  if (!APP || window.__fbkLoaded) return;
  window.__fbkLoaded = true;

  var T = {
    ru: {
      btn: 'Сообщить об ошибке', head: 'Сообщить об ошибке или предложить улучшение',
      lead: 'Напишите, что не работает или чего не хватает. Сообщение уйдёт разработчику вместе с версией приложения. Нужен интернет.',
      warn: 'Не пишите пароли, коды доступа и закрытые сведения: опишите, где и что не работает.',
      bug: 'Ошибка', idea: 'Пожелание', text: 'Что случилось или что добавить',
      contact: 'Как с вами связаться (необязательно)', contactPh: 'Telegram или телефон',
      send: 'Отправить', sending: 'Отправляю…', ok: 'Отправлено. Спасибо!', close: 'Закрыть',
      short: 'Опишите подробнее — хотя бы пару слов.',
      offline: 'Нет интернета. Сообщение не отправлено — попробуйте позже.',
      many: 'Слишком много сообщений подряд. Попробуйте через 10 минут.',
      fail: 'Не удалось отправить. Попробуйте позже.'
    },
    tg: {
      btn: 'Дар бораи хато хабар додан', head: 'Дар бораи хато хабар додан ё пешниҳод кардан',
      lead: 'Нависед, ки чӣ кор намекунад ё чӣ намерасад. Паём ба таҳиягар бо версияи барнома меравад. Интернет лозим аст.',
      warn: 'Паролҳо, рамзҳои дастрасӣ ва маълумоти махфиро нанависед: нависед, ки дар куҷо ва чӣ кор намекунад.',
      bug: 'Хато', idea: 'Пешниҳод', text: 'Чӣ шуд ё чӣ илова кардан лозим аст',
      contact: 'Бо шумо чӣ тавр тамос гирем (ихтиёрӣ)', contactPh: 'Telegram ё телефон',
      send: 'Фиристодан', sending: 'Фиристода истодаам…', ok: 'Фиристода шуд. Ташаккур!', close: 'Пӯшидан',
      short: 'Муфассалтар нависед — ақаллан ду-се калима.',
      offline: 'Интернет нест. Паём фиристода нашуд — баъдтар кӯшиш кунед.',
      many: 'Паёмҳо аз ҳад зиёд шуданд. Баъд аз 10 дақиқа кӯшиш кунед.',
      fail: 'Фиристода нашуд. Баъдтар кӯшиш кунед.'
    },
    en: {
      btn: 'Report a problem', head: 'Report a problem or suggest an improvement',
      lead: 'Tell us what does not work or what is missing. The message goes to the developer together with the app version. Internet is required.',
      warn: 'Do not include passwords, access codes or restricted information: describe where and what does not work.',
      bug: 'Problem', idea: 'Suggestion', text: 'What happened or what to add',
      contact: 'How to reach you (optional)', contactPh: 'Telegram or phone',
      send: 'Send', sending: 'Sending…', ok: 'Sent. Thank you!', close: 'Close',
      short: 'Please add a few more words.',
      offline: 'No internet. The message was not sent — please try later.',
      many: 'Too many messages in a row. Please try again in 10 minutes.',
      fail: 'Could not send. Please try later.'
    }
  };
  function L() {
    var l = String(document.documentElement.lang || '').toLowerCase().slice(0, 2);
    return T[l === 'tj' ? 'tg' : l] || T.ru;
  }

  var css = document.createElement('style');
  css.textContent =
    '.fbk-btn{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483000;' +
    'width:40px;height:40px;border-radius:50%;border:1px solid rgba(128,128,128,.45);background:rgba(30,30,30,.72);' +
    'color:#fff;font:18px/1 system-ui,sans-serif;cursor:pointer;opacity:.7;padding:0}' +
    '.fbk-btn:hover,.fbk-btn:focus-visible{opacity:1}' +
    '.fbk-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '.fbk-box{background:#fff;color:#1a1a1a;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:16px 16px 0 0;' +
    'padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));font:15px/1.4 system-ui,sans-serif;box-sizing:border-box}' +
    '@media (prefers-color-scheme:dark){.fbk-box{background:#222;color:#eee}.fbk-box textarea,.fbk-box input{background:#111;color:#eee;border-color:#555}}' +
    '.fbk-box h2{margin:0 0 6px;font-size:17px}.fbk-box p{margin:0 0 10px;font-size:13px;opacity:.8}' +
    '.fbk-box textarea,.fbk-box input[type=text]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:10px;font:inherit;margin:4px 0 10px}' +
    '.fbk-box textarea{min-height:96px;resize:vertical}' +
    '.fbk-kind{display:flex;gap:8px;margin-bottom:10px}.fbk-kind label{flex:1;border:1px solid #bbb;border-radius:10px;padding:10px;text-align:center;cursor:pointer}' +
    '.fbk-kind input{position:absolute;opacity:0}.fbk-kind label.on{border-color:#2563eb;background:rgba(37,99,235,.12)}' +
    '.fbk-row{display:flex;gap:8px}.fbk-row button{flex:1;min-height:44px;border-radius:10px;border:1px solid #bbb;background:transparent;color:inherit;font:inherit;cursor:pointer}' +
    '.fbk-row .fbk-go{background:#2563eb;border-color:#2563eb;color:#fff}.fbk-row button:disabled{opacity:.5}' +
    '.fbk-msg{min-height:20px;margin:8px 0 0;font-size:13px}';
  document.head.appendChild(css);

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function open() {
    var t = L(), kind = 'bug';
    var back = el('div', 'fbk-back'), box = el('div', 'fbk-box');
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
    box.appendChild(el('h2', '', t.head));
    box.appendChild(el('p', '', t.lead));
    box.appendChild(el('p', '', t.warn));
    var kinds = el('div', 'fbk-kind');
    ['bug', 'idea'].forEach(function (k) {
      var lb = el('label', k === kind ? 'on' : '', t[k]);
      lb.addEventListener('click', function () { kind = k; Array.prototype.forEach.call(kinds.children, function (c) { c.className = ''; }); lb.className = 'on'; });
      kinds.appendChild(lb);
    });
    box.appendChild(kinds);
    var ta = el('textarea'); ta.setAttribute('aria-label', t.text); ta.placeholder = t.text; ta.maxLength = 2000; box.appendChild(ta);
    var ct = el('input'); ct.type = 'text'; ct.maxLength = 120; ct.placeholder = t.contactPh; ct.setAttribute('aria-label', t.contact); box.appendChild(ct);
    var hp = el('input'); hp.type = 'text'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'; box.appendChild(hp);
    var row = el('div', 'fbk-row'), go = el('button', 'fbk-go', t.send), cl = el('button', '', t.close);
    go.type = 'button'; cl.type = 'button';
    row.appendChild(go); row.appendChild(cl); box.appendChild(row);
    var msg = el('div', 'fbk-msg'); msg.setAttribute('aria-live', 'polite'); box.appendChild(msg);
    back.appendChild(box); document.body.appendChild(back);
    ta.focus();

    function shut() { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') shut(); }
    document.addEventListener('keydown', esc);
    cl.addEventListener('click', shut);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    go.addEventListener('click', function () {
      var text = ta.value.trim();
      if (text.length < 5) { msg.textContent = t.short; return; }
      if (navigator.onLine === false) { msg.textContent = t.offline; return; }
      go.disabled = true; msg.textContent = t.sending;
      fetch(URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: APP, version: VER, kind: kind, text: text, where: location.pathname.slice(0, 120), contact: ct.value.trim(), hp: hp.value })
      }).then(function (r) { return r.json().then(function (d) { return { st: r.status, d: d }; }); })
        .then(function (x) {
          if (x.st === 429) { msg.textContent = t.many; go.disabled = false; return; }
          if (!x.d || !x.d.ok) { msg.textContent = t.fail; go.disabled = false; return; }
          msg.textContent = t.ok; ta.value = ''; setTimeout(shut, 1400);
        })
        .catch(function () { msg.textContent = t.offline; go.disabled = false; });
    });
  }

  function mount() {
    var b = el('button', 'fbk-btn', '💬'); b.type = 'button';
    b.setAttribute('aria-label', L().btn); b.title = L().btn;
    b.addEventListener('click', open);
    document.body.appendChild(b);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
