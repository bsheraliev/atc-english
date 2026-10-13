# -*- coding: utf-8 -*-
"""Сборка guide.html — копии проводника AvEng для сайта приложения.

Исходник один: docs/guide.html (он же публикуется страницей на claude.ai и потому
не содержит <html>/<head>/<body>). Здесь он оборачивается в полноценный документ,
получает ссылку «В приложение» и текущий номер версии из app.js.
Запускать из корня проекта после правки docs/guide.html и после смены версии:
    python scripts/build-guide.py
guide.html вручную не править."""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = io.open(os.path.join(ROOT, 'docs', 'guide.html'), encoding='utf-8').read()
app = io.open(os.path.join(ROOT, 'app.js'), encoding='utf-8').read()

ver = re.search(r'const APP_VERSION = "([\d.]+)"', app).group(1)
title = re.search(r'<title>(.*?)</title>', src).group(1)
body = re.sub(r'<title>.*?</title>\s*', '', src, count=1)

# номер версии на мини-экранах — тот же, что у приложения
body, n = re.subn(r"const VER='v[\d.]+';", "const VER='v%s';" % ver, body)
if n != 1:
    sys.exit('Не найдена строка const VER в docs/guide.html')

# Ссылка назад: в установленном приложении у страницы нет кнопки «назад».
# Внутри слоя приложения (iframe) она не нужна — там есть своя кнопка «Закрыть».
back = ('<a class="backapp" id="backapp" href="./">← В приложение</a>\n'
        '<style>.backapp{display:inline-block;margin:14px 18px 0;font:600 14px var(--font-body);'
        'color:var(--accent);text-decoration:none;padding:8px 0}'
        '.backapp:focus-visible{outline:2px solid var(--accent);outline-offset:2px}</style>\n'
        '<script>if(window.self!==window.top)document.getElementById("backapp").hidden=true;</script>\n')

out = ('<!doctype html>\n<!-- Сгенерировано scripts/build-guide.py из docs/guide.html — вручную не править. -->\n'
       '<html lang="ru" data-site>\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       '<meta name="theme-color" content="#06121a">\n'
       '<title>%s</title>\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n'
       '<style>html{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}'
       'img{max-width:100%%}[hidden]{display:none!important}</style>\n'
       '</head>\n<body>\n%s%s</body>\n</html>\n') % (title, back, body)

io.open(os.path.join(ROOT, 'guide.html'), 'w', encoding='utf-8', newline='\n').write(out)
print('guide.html собран: версия v%s, %d КБ' % (ver, len(out.encode('utf-8')) // 1024))
