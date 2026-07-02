/* AvEng — лидерборд + ежедневные напоминания через бота (Google Apps Script).
   Это РАСШИРЕННАЯ версия leaderboard.gs: к лидерборду добавлены
   подписчики (chat_id) и ежедневная рассылка «не теряй стрик» через Telegram Bot API.

   КАК ВКЛЮЧИТЬ (один раз):
   1) Откройте ваш проект Apps Script (тот, что уже деплоен как Web app для лидерборда).
   2) Замените код на этот файл, сохраните.
   3) Project Settings → Script properties → добавьте свойство:
         BOT_TOKEN = <токен вашего бота от @BotFather>   ← это секрет, вводите ТОЛЬКО вы.
   4) Deploy → Manage deployments → Edit (карандаш) → Version: New version → Deploy.
   5) Запустите один раз функцию  setupDailyTrigger  (меню «Выполнить») — она создаст
      ежедневный триггер на ~19:00. Авторизуйте при запросе.
   6) В app.js поставьте REMINDERS.on = true и опубликуйте — тогда Mini App при открытии
      будет регистрировать пользователя (chat_id) для рассылки.

   Приватный чат: chat_id == id пользователя Telegram. Бот может писать только тем,
   кто его «запустил» (открытие Mini App через кнопку меню бота это обеспечивает). */

const SHEET_NAME = "scores";
const SUBS_NAME  = "subs";
const APP_URL    = "https://bsheraliev.github.io/atc-english/";
const BOT_USER   = "AvEngApp_bot";

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify(readTop(30)))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (body.action === "register") {
    registerSub(body.id, body.name);
    return json({ ok: true, registered: true });
  }
  var name = String(body.name || "Гость").slice(0, 48);
  var score = Math.max(0, Math.min(1000000, parseInt(body.score, 10) || 0));
  upsert(name, score);
  return json({ ok: true });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/* ---------- Лидерборд ---------- */
function readTop(n) {
  var rows = sheet_(SHEET_NAME).getDataRange().getValues();
  var data = rows
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { username: String(r[0]), score: Number(r[1]) || 0 }; });
  data.sort(function (a, b) { return b.score - a.score; });
  return data.slice(0, n);
}
function upsert(name, score) {
  var sh = sheet_(SHEET_NAME);
  var rows = sh.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === name) {
      if (score > (Number(rows[i][1]) || 0)) {
        sh.getRange(i + 1, 2).setValue(score);
        sh.getRange(i + 1, 3).setValue(new Date());
      }
      return;
    }
  }
  sh.appendRow([name, score, new Date()]);
}

/* ---------- Подписчики (для рассылки) ---------- */
function registerSub(id, name) {
  id = String(id || "").replace(/[^0-9]/g, "");
  if (!id) return;
  var sh = sheet_(SUBS_NAME);
  var rows = sh.getDataRange().getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      sh.getRange(i + 1, 2).setValue(String(name || "").slice(0, 48));
      sh.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sh.appendRow([id, String(name || "").slice(0, 48), new Date()]);
}

/* ---------- Ежедневная рассылка ---------- */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendDailyReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendDailyReminders").timeBased().everyDays(1).atHour(19).create();
}

function sendDailyReminders() {
  var token = PropertiesService.getScriptProperties().getProperty("BOT_TOKEN");
  if (!token) return;
  var msgs = [
    "🔥 Не теряй стрик! 5 минут радиофразеологии сегодня — и серия продолжается.",
    "✈️ Готов к смене? Пройди пару вопросов по фразеологии ИКАО в AvEng.",
    "🎯 Ежедневная цель ждёт. Открой AvEng и держи форму по авиационному английскому.",
    "📻 Read-back, метео, аварийные — 5 вопросов в AvEng и ты на шаг ближе к Level 5."
  ];
  var text = msgs[new Date().getDate() % msgs.length];
  var rows = sheet_(SUBS_NAME).getDataRange().getValues();
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  rows.forEach(function (r) {
    var id = String(r[0] || "").replace(/[^0-9]/g, "");
    if (!id) return;
    var payload = {
      chat_id: id,
      text: text,
      reply_markup: { inline_keyboard: [[{ text: "▶️ Открыть AvEng", url: "https://t.me/" + BOT_USER + "?startapp" }]] }
    };
    try {
      UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    } catch (err) {}
    Utilities.sleep(60); // мягкий темп, чтобы не упереться в лимиты Telegram
  });
}
