#!/usr/bin/env python3
"""
Local dev server that mirrors the production .htaccess clean-URL rules.

`python -m http.server` is a dumb static server: it only serves paths that map
to a real file on disk, so pretty routes like /bitcoin-puzzle/71/random 404
locally even though production (GitHub Pages + cPanel .htaccess) serves them.

This server replays the same rewrite rules the .htaccess uses, so a local
preview at http://127.0.0.1:8000 behaves exactly like the deployed site.
It changes ZERO website files — it only affects how requests are routed locally.

    python _devserver.py            # serves this folder on 127.0.0.1:8000
    python _devserver.py 8080       # custom port
"""
import os
import re
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


def _abs(rel):
    return os.path.join(ROOT, rel.replace('/', os.sep))


def _isfile(rel):
    return os.path.isfile(_abs(rel))


def _isdir(rel):
    return os.path.isdir(_abs(rel))


def resolve(path):
    """URL path (decoded, no query) -> on-disk relative path, or None (404)."""
    p = path.strip('/')

    # Root and real files/dirs serve themselves.
    if p == '':
        return 'index.html' if _isfile('index.html') else None
    if _isfile(p):
        return p
    if _isdir(p) and _isfile(p + '/index.html'):
        return p + '/index.html'

    # 1) Generic "serve .html without extension"  (/foo/bar -> /foo/bar.html)
    #    Covers /bitcoin-puzzle/71/random -> /bitcoin-puzzle/71/random.html
    if _isfile(p + '.html'):
        return p + '.html'

    # 2) /key/<value>              -> /key.html   (template renders from path)
    if re.match(r'^key/[^/]+$', p) and _isfile('key.html'):
        return 'key.html'

    # 3) /brainwallet/<chain>/<n>  -> /brainwallet/<chain>/2.html
    m = re.match(r'^brainwallet/([a-z0-9-]+)/([0-9]+)$', p)
    if m and _isfile('brainwallet/%s/2.html' % m.group(1)):
        return 'brainwallet/%s/2.html' % m.group(1)

    # 4) /brainwallet/<n>          -> /brainwallet/bitcoin/<n>.html
    m = re.match(r'^brainwallet/([0-9]+)$', p)
    if m and _isfile('brainwallet/bitcoin/%s.html' % m.group(1)):
        return 'brainwallet/bitcoin/%s.html' % m.group(1)

    # 5) /bitcoin-dormant/address/<addr> -> /bitcoin-dormant/address.html
    if re.match(r'^bitcoin-dormant/address/[^/]+$', p) and _isfile('bitcoin-dormant/address.html'):
        return 'bitcoin-dormant/address.html'

    # 6) /bitcoin-dormant/<n>      -> /bitcoin-dormant/_page.html
    if re.match(r'^bitcoin-dormant/[0-9]+$', p) and _isfile('bitcoin-dormant/_page.html'):
        return 'bitcoin-dormant/_page.html'

    # 7) /<a>/<b>                  -> /<a>/<b>.html   (e.g. /private-keys/bitcoin)
    m = re.match(r'^([a-z0-9-]+)/([a-z0-9-]+)$', p)
    if m and _isfile('%s/%s.html' % (m.group(1), m.group(2))):
        return '%s/%s.html' % (m.group(1), m.group(2))

    # 8) /<a>/<n>                  -> /<a>/<n>.html   (e.g. /bitcoin-puzzle/42)
    m = re.match(r'^([a-z0-9-]+)/([0-9]+)$', p)
    if m and _isfile('%s/%s.html' % (m.group(1), m.group(2))):
        return '%s/%s.html' % (m.group(1), m.group(2))

    # 9) /milk-sad/<chain>/<n>     -> /milk-sad/<chain>/1.html
    m = re.match(r'^milk-sad/([a-z0-9-]+)/([0-9]+)$', p)
    if m and _isfile('milk-sad/%s/1.html' % m.group(1)):
        return 'milk-sad/%s/1.html' % m.group(1)

    return None


class Handler(SimpleHTTPRequestHandler):
    # Match the .htaccess AddType directives so ES-module workers + WASM load.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.wasm': 'application/wasm',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _rewrite(self):
        parsed = urllib.parse.urlsplit(self.path)
        decoded = urllib.parse.unquote(parsed.path)
        target = resolve(decoded)
        if target is None:
            # ErrorDocument 404 /index.html  -> SPA-style fallback
            target = 'index.html' if _isfile('index.html') else decoded.strip('/')
        new = '/' + urllib.parse.quote(target)
        if parsed.query:
            new += '?' + parsed.query
        self.path = new

    def do_GET(self):
        self._rewrite()
        return super().do_GET()

    def do_HEAD(self):
        self._rewrite()
        return super().do_HEAD()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('Serving %s' % ROOT)
    print('Clean-URL dev server (mirrors .htaccess) -> http://127.0.0.1:%d/' % port)
    print('Try: http://127.0.0.1:%d/bitcoin-puzzle/71/random' % port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
