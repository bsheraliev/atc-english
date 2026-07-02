# Мини-бэкенд подписчиков ботов (AvEng + AvSec)

Считает уникальных подписчиков (кто нажал **Start** в боте), дату подписки и
источник (по `startapp`-параметру рекламной ссылки). Один скрипт на оба бота.
Код: **`subscribers.gs`**.

> ✅ **РАЗВЁРНУТО 2026-07-01** (через Chrome). Веб-приложение уже работает:
> `EXEC_URL` = `https://script.google.com/macros/s/AKfycbzi2p2qelPeK4a0aJlmmZdb3EWvdTbspxxQfJWhj2SZpBIX9fAuE-RKT8PZm4_IPDK8/exec`
> Осталось только **вставить токены** и **включить webhook** (шаги 3–4 ниже) — это твоя часть.

> Что даёт: точное число подписчиков, график роста по дням, разбивку по источникам.
> Дополняет GoatCounter (тот считает открытия мини-аппа; этот — подписчиков бота).

---

## Шаги (≈10 минут, разово)

### 1. Создать скрипт и вставить код
1. Открой **script.new** (создаст пустой проект Apps Script; таблицу он создаст сам при первом /start).
2. Удали пустой `function myFunction(){}`, вставь весь код из **`subscribers.gs`**, сохрани (💾).

### 2. Развернуть как веб-приложение
1. **Начать развёртывание → Новое развёртывание**.
2. Тип (шестерёнка) → **Веб-приложение**.
3. «Запуск от имени» = **От моего имени**; «У кого есть доступ» = **Все**.
4. **Начать развёртывание** → **Предоставить доступ** → авторизуйся (Разрешить).
5. Скопируй **URL веб-приложения** (…/exec) — назовём его `EXEC_URL`.

### 3. Вставить токены ботов  ← твой секрет, делаешь сам
1. В редакторе Apps Script: **⚙️ Настройки проекта → Свойства скрипта → Добавить свойство**.
2. Добавь два свойства (значения — токены из @BotFather):
   - `BOT_TOKEN_AVENG` = токен бота **@AvEngApp_bot**
   - `BOT_TOKEN_AVSEC` = токен бота **@AvSecApp_bot**
3. Сохрани.

> Если приветственное сообщение не нужно — этот шаг можно пропустить: подписчики
> всё равно будут считаться, просто бот не будет отвечать на /start.

### 4. Включить webhook для каждого бота  ← в адресе есть токен, делаешь сам
Открой в браузере два адреса (подставь свой токен и `EXEC_URL`). Часть `?app=…`
уже закодирована как `%3Fapp%3D…` — так и нужно:

**AvEng** (подставь только `<ТОКЕН_AVENG>`):
```
https://api.telegram.org/bot<ТОКЕН_AVENG>/setWebhook?url=https://script.google.com/macros/s/AKfycbzi2p2qelPeK4a0aJlmmZdb3EWvdTbspxxQfJWhj2SZpBIX9fAuE-RKT8PZm4_IPDK8/exec%3Fapp%3Daveng
```
**AvSec** (подставь только `<ТОКЕН_AVSEC>`):
```
https://api.telegram.org/bot<ТОКЕН_AVSEC>/setWebhook?url=https://script.google.com/macros/s/AKfycbzi2p2qelPeK4a0aJlmmZdb3EWvdTbspxxQfJWhj2SZpBIX9fAuE-RKT8PZm4_IPDK8/exec%3Fapp%3Davsec
```
Ответ `{"ok":true,"result":true,"description":"Webhook was set"}` = готово.

> ⚠️ У бота может быть только ОДИН webhook. Сейчас у ботов webhook не стоит
> (работает только кнопка-меню), поэтому конфликта нет. Если позже понадобится
> убрать: `https://api.telegram.org/bot<ТОКЕН>/deleteWebhook`.

---

## Как смотреть число подписчиков
Открой в браузере (публичные счётчики, без персональных данных):
```
https://script.google.com/macros/s/AKfycbzi2p2qelPeK4a0aJlmmZdb3EWvdTbspxxQfJWhj2SZpBIX9fAuE-RKT8PZm4_IPDK8/exec?app=aveng&action=stats
https://script.google.com/macros/s/AKfycbzi2p2qelPeK4a0aJlmmZdb3EWvdTbspxxQfJWhj2SZpBIX9fAuE-RKT8PZm4_IPDK8/exec?app=avsec&action=stats
```
Получишь JSON: `subscribers` (всего), `byDay` (рост по дням), `bySource` (откуда пришли).
Сами подписчики (id/имя/дата/источник) — на вкладках `subs_aveng` / `subs_avsec` в таблице.

## Проверка
Напиши боту `/start` — в таблице появится строка, а бот пришлёт кнопку «Открыть»
(если задан токен). Повторный `/start` от тебя же дубль не создаёт (считаем уникальных).

## Рекламные ссылки с источником
Ссылка `t.me/AvEngApp_bot?start=promo1` → у нового подписчика в колонке `start_param`
будет `promo1`. Так видно, какая рассылка/пост/QR привёл людей (в `bySource`).
