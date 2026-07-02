/* ─────────────────────────────────────────────────────────────────────────
   Единый бэкенд аналитики ботов AvEng / AvSec.
     • webhook на /start → лог уникальных подписчиков (вкладки subs_aveng/subs_avsec);
     • сводный ДАШБОРД: подписчики + визиты/события из GoatCounter (?action=dashboard);
     • НЕДЕЛЬНАЯ СВОДКА на почту владельца (функция weeklyDigest + недельный триггер).

   Секреты — только в Script Properties (в коде их нет):
     BOT_TOKEN_AVENG / BOT_TOKEN_AVSEC — токены ботов (для ответа на /start);
     GC_TOKEN_AVENG  / GC_TOKEN_AVSEC  — API-токены GoatCounter (Username → API),
                                         нужны для визитов/событий в дашборде и письме.

   Webhook: <EXEC_URL>?app=aveng  и  <EXEC_URL>?app=avsec
   Дашборд: <EXEC_URL>?action=dashboard
   JSON подписчиков: <EXEC_URL>?app=aveng&action=stats
   ───────────────────────────────────────────────────────────────────────── */

var APPS = ["aveng", "avsec"];
var APP_TITLE = { aveng: "AvEng · авиац. английский", avsec: "AvSec · авиабезопасность" };
var APP_URLS  = { aveng: "https://bsheraliev.github.io/atc-english/", avsec: "https://bsheraliev.github.io/avsec/" };
var GC_CODE   = { aveng: "aveng", avsec: "avsec" };   // сайты GoatCounter
var OWNER_EMAIL = "b.sheraliev@gmail.com";            // куда слать недельную сводку

/* ─────────── HTTP ─────────── */
function doPost(e) {
  var app = appOf_(e);
  var upd = {};
  try { upd = JSON.parse(e.postData.contents); } catch (err) {}
  if (seenUpdate_(upd.update_id)) return json_({ ok: true });   // защита от ретраев/дублей
  var msg = upd.message || upd.edited_message;
  if (msg && msg.text && msg.text.indexOf("/start") === 0) {
    var startParam = (msg.text.split(" ")[1] || "").slice(0, 40);
    var isNew = logUser_(app, msg.from || {}, startParam);       // отвечаем только НОВОМУ подписчику
    if (isNew) reply_(app, msg.chat.id);
  }
  return json_({ ok: true });
}

/* Каждое обновление Telegram обрабатываем один раз (Telegram может досылать повторно). */
function seenUpdate_(id) {
  if (!id && id !== 0) return false;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(3000); } catch (e) { return false; }
  try {
    var p = PropertiesService.getScriptProperties();
    var seen = p.getProperty("SEEN_UPD") || "|";
    var tok = "|" + id + "|";
    if (seen.indexOf(tok) >= 0) return true;
    p.setProperty("SEEN_UPD", (seen + id + "|").slice(-4000));    // храним «хвост» недавних id
    return false;
  } finally { lock.releaseLock(); }
}

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : "";
  if (action === "dashboard") return HtmlService.createHtmlOutput(reportHtml_(false)).setTitle("AvGames — аналитика");
  if (action === "digest_now") { try { weeklyDigest(); return json_({ ok: true, sent: true }); } catch (err) { return json_({ ok: false, error: String(err) }); } }
  if (action === "gctest") {                       // диагностика GoatCounter API (токен НЕ раскрывается)
    var gapp = appOf_(e);
    var gtok = PropertiesService.getScriptProperties().getProperty("GC_TOKEN_" + gapp.toUpperCase());
    if (!gtok) return json_({ app: gapp, hasToken: false });
    var gend = new Date(), gstart = new Date(gend.getTime() - 7 * 24 * 3600 * 1000);
    var gurl = "https://" + (GC_CODE[gapp] || gapp) + ".goatcounter.com/api/v0/stats/hits?limit=200"
             + "&start=" + encodeURIComponent(isoHour_(gstart)) + "&end=" + encodeURIComponent(isoHour_(gend));
    try {
      var gres = UrlFetchApp.fetch(gurl, { headers: { Authorization: "Bearer " + gtok }, contentType: "application/json", muteHttpExceptions: true });
      return json_({ app: gapp, hasToken: true, code: gres.getResponseCode(), body: String(gres.getContentText()).slice(0, 400) });
    } catch (err2) { return json_({ app: gapp, hasToken: true, error: String(err2) }); }
  }
  return json_(stats_(appOf_(e)));
}

function appOf_(e) {
  var a = (e && e.parameter && e.parameter.app) ? String(e.parameter.app).toLowerCase() : "aveng";
  return (a === "avsec") ? "avsec" : "aveng";
}

/* ─────────── Подписчики (вкладки subs_<app>) ─────────── */
function sheet_(app) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID");
  var ss;
  if (id) { ss = SpreadsheetApp.openById(id); }
  else { ss = SpreadsheetApp.create("Podpischiki botov AvEng/AvSec"); props.setProperty("SHEET_ID", ss.getId()); }
  var name = "subs_" + app;
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(["id", "username", "name", "first_seen", "start_param"]); }
  return sh;
}

function logUser_(app, u, startParam) {
  if (!u || !u.id) return false;
  var sh = sheet_(app);
  var ids = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues();
  for (var i = 1; i < ids.length; i++) { if (String(ids[i][0]) === String(u.id)) return false; }
  var name = ((u.first_name || "") + (u.last_name ? " " + u.last_name : "")).trim();
  sh.appendRow([String(u.id), u.username || "", name, new Date(), startParam || ""]);
  return true;
}

function stats_(app) {
  var rows = sheet_(app).getDataRange().getValues();
  var total = Math.max(0, rows.length - 1);
  var byDay = {}, bySrc = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][3]) { var d = Utilities.formatDate(new Date(rows[i][3]), "GMT", "yyyy-MM-dd"); byDay[d] = (byDay[d] || 0) + 1; }
    var s = rows[i][4] || "(direct)"; bySrc[s] = (bySrc[s] || 0) + 1;
  }
  return { app: app, subscribers: total, byDay: byDay, bySource: bySrc };
}

function subsSummary_(app, start, end) {
  var rows = sheet_(app).getDataRange().getValues();
  var total = 0, added = 0;
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    total++;
    var d = rows[i][3] ? new Date(rows[i][3]) : null;
    if (d && d >= start && d < end) added++;
  }
  return { total: total, added: added };
}

function reply_(app, chatId) {
  var token = PropertiesService.getScriptProperties().getProperty("BOT_TOKEN_" + app.toUpperCase());
  if (!token) return;
  var url = APP_URLS[app] || APP_URLS.aveng;
  var text = (app === "avsec")
    ? "🛡️ AvSec — тренажёр по авиационной безопасности. Нажмите кнопку, чтобы открыть."
    : "✈️ AvEng — тренажёр авиационного английского. Нажмите кнопку, чтобы открыть.";
  var payload = { chat_id: chatId, text: text, reply_markup: { inline_keyboard: [[{ text: "▶️ Открыть", web_app: { url: url } }]] } };
  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) {}
}

/* ─────────── GoatCounter API (визиты/события) ─────────── */
function isoHour_(d) { return Utilities.formatDate(d, "GMT", "yyyy-MM-dd'T'HH:00:00'Z'"); }

function gcSummary_(app, start, end) {
  var token = PropertiesService.getScriptProperties().getProperty("GC_TOKEN_" + app.toUpperCase());
  if (!token) return null;                       // не подключён — вернём null
  var url = "https://" + (GC_CODE[app] || app) + ".goatcounter.com/api/v0/stats/hits?limit=200"
          + "&start=" + encodeURIComponent(isoHour_(start)) + "&end=" + encodeURIComponent(isoHour_(end));
  var hits;
  try {
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token }, contentType: "application/json", muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    hits = (JSON.parse(res.getContentText()) || {}).hits || [];
  } catch (e) { return null; }
  var out = { visitsTg: 0, visitsWeb: 0, opens: {}, done: {}, shares: {}, sources: {} };
  hits.forEach(function (h) {
    var p = String(h.path || "").replace(/^\//, ""); var c = h.count || 0, m;
    if (p === "tg/visit") out.visitsTg += c;
    else if (p === "web/visit") out.visitsWeb += c;
    else if ((m = p.match(/^(?:tg|web)\/open\/(.+)$/))) out.opens[m[1]] = (out.opens[m[1]] || 0) + c;
    else if ((m = p.match(/^(?:tg|web)\/done\/(.+)$/))) out.done[m[1]] = (out.done[m[1]] || 0) + c;
    else if ((m = p.match(/^(?:tg|web)\/share\/(.+)$/))) out.shares[m[1]] = (out.shares[m[1]] || 0) + c;
    else if ((m = p.match(/^(?:tg|web)\/src\/(.+)$/))) out.sources[m[1]] = (out.sources[m[1]] || 0) + c;
  });
  return out;
}

/* ─────────── Рендер отчёта (общий для дашборда и письма) ─────────── */
function topRows_(obj, limit) {
  var arr = Object.keys(obj).map(function (k) { return [k, obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  if (limit) arr = arr.slice(0, limit);
  if (!arr.length) return '<div class="muted">—</div>';
  var max = arr[0][1] || 1;
  return arr.map(function (r) {
    var w = Math.round((r[1] / max) * 100);
    return '<div class="row"><span class="lbl">' + esc_(r[0]) + '</span>'
      + '<span class="bar"><i style="width:' + w + '%"></i></span><b>' + r[1] + '</b></div>';
  }).join("");
}
function esc_(s) { return String(s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }

function appBlock_(app, start, end) {
  var s = subsSummary_(app, start, end);
  var g = gcSummary_(app, start, end);
  var h = '<h2>' + esc_(APP_TITLE[app]) + '</h2><div class="cards">'
    + card_("Подписчиков всего", s.total)
    + card_("Новых за неделю", "+" + s.added)
    + (g ? card_("Визитов: Telegram", g.visitsTg) + card_("Визитов: веб/PWA", g.visitsWeb)
         : '<div class="card gc"><div class="cv">—</div><div class="cl">GoatCounter не подключён<br><small>добавьте GC_TOKEN_' + app.toUpperCase() + '</small></div></div>')
    + '</div>';
  if (g) {
    h += '<div class="grid">'
      + '<div class="col"><h3>Открытия модулей</h3>' + topRows_(g.opens, 8) + '</div>'
      + '<div class="col"><h3>Прохождения тестов</h3>' + topRows_(g.done, 8) + '</div>'
      + '<div class="col"><h3>Шаринг</h3>' + topRows_(g.shares, 6) + '</div>'
      + '<div class="col"><h3>Источники переходов</h3>' + topRows_(g.sources, 6) + '</div>'
      + '</div>';
  }
  return h;
}
function card_(label, val) { return '<div class="card"><div class="cv">' + val + '</div><div class="cl">' + label + '</div></div>'; }

function reportHtml_(forEmail) {
  var end = new Date(), start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  var period = Utilities.formatDate(start, "GMT", "dd.MM") + " – " + Utilities.formatDate(end, "GMT", "dd.MM.yyyy");
  var css = '<style>'
    + 'body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b1620;color:#e8f4f8;margin:0;padding:20px}'
    + '.wrap{max-width:860px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.sub{color:#8fb3c2;margin:0 0 20px;font-size:13px}'
    + 'h2{font-size:17px;margin:26px 0 10px;border-bottom:1px solid #1e3444;padding-bottom:6px}'
    + 'h3{font-size:12px;color:#8fb3c2;text-transform:uppercase;letter-spacing:.4px;margin:0 0 8px}'
    + '.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}'
    + '.card{flex:1;min-width:130px;background:#12222e;border:1px solid #1e3444;border-radius:12px;padding:12px 14px}'
    + '.card.gc{flex:2}.cv{font-size:26px;font-weight:800;color:#27e0a0}.cl{font-size:12px;color:#8fb3c2;margin-top:2px}'
    + '.grid{display:flex;flex-wrap:wrap;gap:16px}.col{flex:1;min-width:200px;background:#0f1c26;border:1px solid #1e3444;border-radius:12px;padding:12px 14px}'
    + '.row{display:flex;align-items:center;gap:8px;font-size:13px;margin:5px 0}.lbl{flex:0 0 42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.bar{flex:1;height:8px;background:#12222e;border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#46c2ff,#27e0a0)}'
    + '.row b{flex:0 0 34px;text-align:right}.muted{color:#5b7383;font-size:13px}.foot{color:#5b7383;font-size:11px;margin-top:24px}'
    + '</style>';
  var body = '<div class="wrap"><h1>📊 AvEng / AvSec — аналитика</h1><p class="sub">Период: ' + period + '</p>';
  APPS.forEach(function (app) { body += appBlock_(app, start, end); });
  body += '<p class="foot">Подписчики — из ботов (по /start). Визиты и события — из GoatCounter. '
        + 'Сформировано автоматически.</p></div>';
  return (forEmail ? "" : css) + (forEmail ? css : "") + body;
}

/* ─────────── Недельная сводка на почту ─────────── */
function weeklyDigest() {
  var email = OWNER_EMAIL;
  try { email = Session.getEffectiveUser().getEmail() || OWNER_EMAIL; } catch (e) {}
  if (!email) return;
  var end = new Date(), start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  var subj = "📊 AvEng/AvSec — сводка за неделю (" + Utilities.formatDate(end, "GMT", "dd.MM.yyyy") + ")";
  MailApp.sendEmail({ to: email, subject: subj, htmlBody: reportHtml_(true) });
}

/* Запустить ОДИН раз (вручную в редакторе) — ставит еженедельный триггер на понедельник ~9:00. */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "weeklyDigest") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("weeklyDigest").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  return "weekly trigger installed";
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
