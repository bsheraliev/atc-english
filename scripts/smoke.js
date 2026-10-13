/* AvEng — сквозная проверка экранов («ворота»).
   Открывает каждый режим во всех четырёх ролях и на трёх языках и ловит любые ошибки,
   в том числе асинхронные. Прогонять в превью до слова «готово» и до запроса на слияние:

     в консоли браузера на http://localhost:8099 :
       await (await fetch('scripts/smoke.js', {cache:'no-store'})).text().then(eval);
       const r = await AVENG_SMOKE(); r.failed + ' — ' + r.report

   Прогресс (localStorage) снимается перед проверкой и возвращается в конце,
   поэтому проверку можно гонять и на устройстве с настоящим прогрессом.

   Появилась потому, что меню зависит от роли, от языка и от того, открыта ли лицензия:
   правка, проверенная на одном экране, молча ломает тот же экран в другой роли. */
window.AVENG_SMOKE = async function () {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], rows = [];
  const onErr = e => errs.push(e.message || String(e));
  const onRej = e => errs.push('promise: ' + ((e.reason && e.reason.message) || e.reason));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);

  const view = () => document.querySelector('#app');
  const snapshot = localStorage.getItem(SAVE_KEY);

  /* таймеры, звук и всплывашки предыдущего шага не должны течь в следующий */
  function cleanup() {
    try { if (typeof attCleanup === 'function') attCleanup(); } catch (e) {}
    try { if (typeof quizTimer !== 'undefined' && quizTimer) clearInterval(quizTimer); } catch (e) {}
    try { if (typeof lstAudio !== 'undefined' && lstAudio) { lstAudio.pause(); lstAudio = null; } } catch (e) {}
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    document.querySelectorAll('.toast').forEach(n => n.remove());
  }

  /* шаг: выполнить, подождать, убедиться, что нет ошибок и экран не пустой */
  async function step(name, fn, opts = {}) {
    const before = errs.length;
    let thrown = '';
    try { await fn(); } catch (e) { thrown = e.message || String(e); }
    await w(opts.wait || 120);
    const problems = [];
    if (thrown) problems.push('исключение: ' + thrown);
    errs.slice(before).forEach(e => { if (!(opts.network && /fetch|network|Failed to fetch/i.test(e))) problems.push('ошибка: ' + e); });
    if (!view() || !view().children.length) problems.push('пустой экран');
    if (opts.has && !opts.has()) problems.push('нет ожидаемого содержимого');
    rows.push({ name, ok: !problems.length, problems });
    cleanup();
  }

  const LANGS = ['ru', 'tg', 'en'];
  const ROLES = ['controller', 'pilot', 'cabin', 'airport'];
  const menuFor = role => MENU.filter(m => m.roles.indexOf('all') >= 0 || m.roles.indexOf(role) >= 0);
  const locked = go => !!(window.AvEngLic && AvEngLic.locked(go));
  const onUnlockScreen = () => !!document.querySelector('#licCode');

  /* --- данные на месте --- */
  await step('данные: банк вопросов', async () => { renderHome(); },
    { has: () => DATA && DATA.quiz && DATA.quiz.length > 0 });
  await step('данные: радиоалфавит 26 букв', async () => {},
    { has: () => DATA.alphabet && DATA.alphabet.length === 26 });
  await step('данные: ранги и ачивки', async () => {},
    { has: () => DATA.ranks.length > 0 && DATA.achievements.length > 0 });
  await step('версия показана в подвале', async () => { renderHome(); },
    { has: () => (view().textContent || '').indexOf(APP_VERSION) >= 0 });

  /* --- языки: главный экран на всех трёх --- */
  for (const L of LANGS) {
    await step('[' + L + '] главный экран', async () => { changeLang(L); },
      { wait: 200, has: () => view().querySelectorAll('.langchip').length === 3 && view().querySelector('.menu') });
  }
  changeLang('ru');

  /* --- роли: меню и каждый режим --- */
  for (const role of ROLES) {
    const P = '[' + role + '] ';
    const list = menuFor(role);
    await step(P + 'меню роли', async () => { setRole(role); },
      { wait: 200, has: () => view().querySelectorAll('.menu > .tile, .menu > .tile.locked').length === list.length });

    for (const m of list) {
      const wasLocked = locked(m.go);
      await step(P + m.go + (wasLocked ? ' (под замком)' : ''), async () => { route(m.go); },
        { wait: m.go === 'blitz' || m.go === 'exam' ? 250 : 150,
          has: () => wasLocked ? onUnlockScreen() : true });
      renderHome();
    }
  }
  setRole('controller');

  /* --- экраны из нижней части главного --- */
  const screens = [
    ['ачивки', () => renderAch()],
    ['статистика', () => renderStats()],
    ['настройки', () => renderSettings()],
    ['справочник', () => renderRef()],
    ['сертификат', () => renderCertificate()],
    ['журнал аттестаций', () => renderAttestLog()],
    ['экран кода организации', () => renderUnlock(), { has: onUnlockScreen }]
  ];
  for (const [name, fn, opts] of screens) {
    await step(name, async () => { fn(); }, opts || {});
    renderHome();
  }
  /* лидерборд ходит в сеть — сетевую ошибку за поломку не считаем */
  await step('лидерборд', async () => { renderLeaderboard(); }, { wait: 700, network: true });

  /* --- проводник: слой поверх приложения --- */
  const frameUrl = () => { try { return document.querySelector('#guideFrame').contentWindow.location.href; } catch (e) { return ''; } };
  await step('проводник открывается', async () => { openGuide('study'); },
    { wait: 700, has: () => !document.querySelector('#guideLayer').hidden && /guide\.html/.test(frameUrl()) });
  await step('проводник открывается на нужном шаге', async () => { openGuide('exam-5'); },
    { wait: 700, has: () => /#exam-5$/.test(frameUrl()) });
  await step('проводник закрывается', async () => { closeGuide(); },
    { wait: 400, has: () => document.querySelector('#guideLayer').hidden && !document.body.style.overflow });

  /* --- вернуть прогресс владельца --- */
  cleanup();
  try {
    if (snapshot) { Object.assign(state, JSON.parse(snapshot)); localStorage.setItem(SAVE_KEY, snapshot); }
    else localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
  renderHome();
  window.removeEventListener('error', onErr);
  window.removeEventListener('unhandledrejection', onRej);

  const bad = rows.filter(r => !r.ok);
  return {
    failed: bad.length,
    total: rows.length,
    rows,
    report: bad.length
      ? bad.map(r => '✗ ' + r.name + ': ' + r.problems.join('; ')).join('\n')
      : 'все шаги пройдены (' + rows.length + ')'
  };
};
