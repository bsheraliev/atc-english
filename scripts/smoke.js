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
      { wait: 200, has: () => view().querySelectorAll('.langchip').length === 3 && view().querySelector('.quick') && view().querySelectorAll('.tabbar .tab').length === 5 });
  }
  changeLang('ru');

  /* --- роли: меню и каждый режим --- */
  for (const role of ROLES) {
    const P = '[' + role + '] ';
    const list = menuFor(role);
    await step(P + 'меню роли (вкладка «Разделы»)', async () => { setRole(role); renderSections('all'); },
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

  /* --- вкладки и главный экран по образцу приложения аэропорта (обращение №16) --- */
  for (const g of GROUPS) {
    await step('разделы: фильтр «' + g.n + '»', async () => { renderSections(g.k); },
      { has: () => secGroup !== g.k || view().querySelectorAll('.menu > .tile').length === roleMenu().filter(m => g.k === 'all' || m.grp === g.k).length });
  }
  renderSections('all');
  await step('вкладка «Прогресс»', async () => { renderProgress(); }, { has: () => view().querySelectorAll('.lrow').length >= 5 && view().querySelector('.tab.on') });
  await step('вкладка «Ещё»', async () => { renderMore(); }, { has: () => view().querySelector('.lgroup a[data-tg]') && view().querySelectorAll('.langchip').length === 3 });
  await step('«Ещё»: смена языка остаётся на экране', async () => { changeLang('en', renderMore); },
    { has: () => !!view().querySelector('.acc') && /More/.test(view().querySelector('.pageh').textContent) });
  changeLang('ru');
  await step('главный: поиск находит раздел', async () => { renderHome(); homeSearch('алфавит'); },
    { has: () => view().querySelectorAll('#searchRes .sres').length > 0 });
  await step('главный: вопрос дня открывается', async () => { renderHome(); startDayQuestion(); },
    { has: () => !!view().querySelector('.qtext') });
  await step('главный: внутренний экран без нижней панели', async () => { renderHome(); renderAch(); },
    { has: () => !view().querySelector('.tabbar') && !document.body.classList.contains('has-tabs') });
  /* --- Ори: на вкладках есть, по нажатию подсказка с действием и чатом (обращение №19) --- */
  await step('Ори на главном', async () => { renderHome(); }, { has: () => !!view().querySelector('#oriBtn') });
  await step('Ори: подсказка открывается', async () => { oriToggle(); },
    { has: () => { const p = document.querySelector('#oriPop'); return !!(p && p.querySelector('.oriact') && p.querySelector('a[data-tg]') && p.querySelector('.orisec.wide')); } });
  await step('Ори: на вкладках отдельной кнопки обращений нет', async () => {},
    { has: () => { const b = document.querySelector('.fbk-btn'); return !b || getComputedStyle(b).display === 'none'; } });
  await step('Ори: действие подсказки срабатывает', async () => { document.querySelector('#oriPop .oriact').click(); },
    { has: () => !document.querySelector('#oriPop') });
  await step('Ори на вкладке «Ещё», не на внутренних экранах', async () => { renderMore(); },
    { has: () => !!view().querySelector('#oriBtn') });
  document.querySelectorAll('.orihi').forEach(n => n.remove());
  renderHome();

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
  /* --- аттестация: телефон или Telegram обязателен --- */
  const fillAtt = c => { renderAttest(); const q = s => document.querySelector(s);
    q('#attName').value = 'Проверка'; q('#attUnit').value = 'Проверка';
    const og = q('#attOrg'); og.value = og.options[1].value; og.dispatchEvent(new Event('change'));
    const ct = q('#attContact'); ct.value = c; ct.dispatchEvent(new Event('input')); };
  await step('аттестация: без телефона кнопка выключена', async () => { fillAtt(''); },
    { has: () => document.querySelector('#attReq').disabled });
  await step('аттестация: с телефоном кнопка включена', async () => { fillAtt('+992 90 123 45 67'); },
    { has: () => !document.querySelector('#attReq').disabled });
  renderHome();

  /* лидерборд ходит в сеть — сетевую ошибку за поломку не считаем */
  await step('лидерборд', async () => { renderLeaderboard(); }, { wait: 700, network: true });

  /* --- проводник: слой поверх приложения --- */
  const frameUrl = () => { try { return document.querySelector('#guideFrame').contentWindow.location.href; } catch (e) { return ''; } };
  await step('проводник открывается', async () => { openGuide('study'); },
    { wait: 700, has: () => !document.querySelector('#guideLayer').hidden && /guide\.html/.test(frameUrl()) });
  await step('проводник открывается на нужном шаге', async () => { openGuide('exam-5'); },
    { wait: 700, has: () => /#exam-5$/.test(frameUrl()) });
  await step('под проводником спрятана кнопка обращений', async () => {},
    { has: () => { const b = document.querySelector('.fbk-btn'); return !b || getComputedStyle(b).display === 'none'; } });
  await step('проводник закрывается', async () => { closeGuide(); },
    { wait: 400, has: () => document.querySelector('#guideLayer').hidden && !document.body.style.overflow
        && !document.body.classList.contains('guide-open') });

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
