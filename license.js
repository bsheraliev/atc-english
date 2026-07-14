/* ===========================================================================
   AvEng — клиентский слой лицензии (грузится МЕЖДУ data.js и app.js).
   Аноним видит пробник (радиоалфавит + SAMPLE_CATS квиза). По коду организации
   ОБЩИЙ бэкенд (app=aveng) отдаёт ключ AES → берём публичный data.full.enc и
   расшифровываем полную IP (quiz/dialogues/listening/elpet); кэш → офлайн, TTL.
   Ключа в статических файлах нет — он приходит с сервера после проверки лицензии.
   =========================================================================== */
(function () {
  var LIC_KEY = "aveng_license_v1";
  var GAS_URL = "https://script.google.com/macros/s/AKfycbzzPC5DZm_c36DIjrT5yaxhlEgheqq8U-KO_fgNhskpJ27h6a5j-9mfaqR9xIbHsLnIYw/exec";
  var ENC_URL = "./data.full.enc";
  var APP = "aveng";

  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  function decryptFull(encB64, keyB64) {
    var raw = b64ToBytes(encB64), key = b64ToBytes(keyB64);
    var iv = raw.slice(0, 12), body = raw.slice(12);
    return crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"])
      .then(function (ck) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, ck, body); })
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(new Uint8Array(buf))); });
  }

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function loadCache() { try { return JSON.parse(localStorage.getItem(LIC_KEY) || "null"); } catch (e) { return null; } }
  function saveCache(o) { try { localStorage.setItem(LIC_KEY, JSON.stringify(o)); } catch (e) {} }
  function clearCache() { try { localStorage.removeItem(LIC_KEY); } catch (e) {} }

  var full = false, org = "", expires = "";

  /* Подставить полную IP в глобальный DATA */
  function applyFull(f) {
    if (!window.DATA || !f) return;
    if (Array.isArray(f.quiz) && f.quiz.length) DATA.quiz = f.quiz;
    if (Array.isArray(f.dialogues)) DATA.dialogues = f.dialogues;
    if (Array.isArray(f.listening)) DATA.listening = f.listening;
    if (f.elpet) DATA.elpet = f.elpet;
    full = true;
  }

  /* При старте (СИНХРОННО): валидный кэш хранит уже открытую IP → сразу подставляем. */
  (function initFromCache() {
    var c = loadCache();
    if (!c || !c.full) return;
    if (c.expires && todayStr() > c.expires) { clearCache(); return; }
    applyFull(c.full); org = c.org || ""; expires = c.expires || "";
  })();

  function unlock(code) {
    code = String(code || "").trim();
    if (!code) return Promise.resolve({ ok: false, error: "empty" });
    var meta;
    return fetch(GAS_URL + "?action=unlock&app=" + APP + "&code=" + encodeURIComponent(code))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw { soft: true, error: (res && res.error) || "invalid", expires: res && res.expires };
        meta = res;
        return fetch(ENC_URL).then(function (r) { return r.text(); });
      })
      .then(function (encB64) { return decryptFull(encB64, meta.key); })
      .then(function (f) {
        applyFull(f);
        org = meta.org || ""; expires = meta.expires || "";
        saveCache({ code: code, org: org, expires: expires, full: f });
        return { ok: true, org: org, expires: expires, count: (f.quiz || []).length };
      })
      .catch(function (e) {
        if (e && e.soft) return { ok: false, error: e.error, expires: e.expires };
        return { ok: false, error: "network" };
      });
  }

  function deactivate() { clearCache(); full = false; org = ""; expires = ""; }

  var SAMPLE = (typeof window.SAMPLE_CATS !== "undefined") ? window.SAMPLE_CATS : [];
  var GATED = (typeof window.GATED_MODES !== "undefined") ? window.GATED_MODES : [];
  window.AvEngLic = {
    isFull: function () { return full; },
    org: function () { return org; },
    expires: function () { return expires; },
    /* заблокировано в демо: платный режим, либо quiz-тема вне пробника */
    locked: function (go) {
      if (full) return false;
      if (GATED.indexOf(go) !== -1) return true;
      if (go.indexOf("quiz-") === 0) return SAMPLE.indexOf(go.slice(5)) === -1;
      return false;
    },
    unlock: unlock,
    deactivate: deactivate
  };
})();
