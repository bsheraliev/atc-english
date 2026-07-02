/* AvEng — лидерборд на Google Apps Script (как синхронизация в «Ремонте»).
   1) Создайте Google Таблицу. В ней: Extensions → Apps Script. Вставьте этот код, сохраните.
   2) Deploy → New deployment → тип "Web app":
        Execute as: Me;  Who has access: Anyone.  → Deploy → авторизуйте.
   3) Скопируйте Web app URL (…/exec) и пришлите — он публичный, не секрет.
   GET  ?action=top  → JSON топ-30;   POST {name, score} → запись (хранит максимум на имя). */
const SHEET_NAME = "scores";

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify(readTop(30)))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  var name = String(body.name || "Гость").slice(0, 48);
  var score = Math.max(0, Math.min(1000000, parseInt(body.score, 10) || 0));
  upsert(name, score);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function readTop(n) {
  var rows = sheet_().getDataRange().getValues();
  var data = rows
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { username: String(r[0]), score: Number(r[1]) || 0 }; });
  data.sort(function (a, b) { return b.score - a.score; });
  return data.slice(0, n);
}

function upsert(name, score) {
  var sh = sheet_();
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
