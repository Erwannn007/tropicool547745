#!/usr/bin/env python3
"""Stamp a fresh cache-busting version into index.html and sw.js.

Every module URL gets ?v=<version> through the import map, so a phone can
never run a mix of old and new files after a deploy. Run before each push:
    python3 tools/bump_version.py
"""
import json, os, re, time

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
v = time.strftime('%Y%m%d%H%M%S')
imports = {'three': f'./vendor/three.module.js?v={v}'}
for f in sorted(os.listdir(os.path.join(root, 'src'))):
    if f.endswith('.js'):
        imports[f'./src/{f}'] = f'./src/{f}?v={v}'
importmap = json.dumps({'imports': imports}, indent=2)

p = os.path.join(root, 'index.html')
html = open(p).read()
html = re.sub(r'<script type="importmap">.*?</script>', f'<script type="importmap">\n{importmap}\n  </script>', html, flags=re.S)
html = re.sub(r'href="style\.css(\?v=\d+)?"', f'href="style.css?v={v}"', html)
html = re.sub(r'src="src/main\.js(\?v=\d+)?"', f'src="src/main.js?v={v}"', html)
html = re.sub(r"window\.TROPICOOL_VERSION = '\d*'", f"window.TROPICOOL_VERSION = '{v}'", html)
open(p, 'w').write(html)

p = os.path.join(root, 'sw.js')
sw = open(p).read()
sw = re.sub(r"const CACHE = 'tropicool-[^']*';", f"const CACHE = 'tropicool-{v}';", sw)
open(p, 'w').write(sw)
print('version', v)
