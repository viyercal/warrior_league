#!/usr/bin/env python3
"""Serve only the production build on loopback for a public tunnel."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse


class GameHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)
        return None

    def send_head(self):
        root = Path(self.directory).resolve()
        requested = Path(self.translate_path(self.path)).resolve()
        if requested.is_dir():
            for name in ('index.html', 'index.htm'):
                if (requested / name).is_file():
                    requested = (requested / name).resolve()
                    break
        if not requested.is_relative_to(root) or any(p.startswith('.') for p in requested.relative_to(root).parts):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5189)
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[1] / 'dist'
    if not (build / 'index.html').is_file():
        parser.error('Run npm run build first.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(GameHandler, directory=str(build)))
    print(f'Serving game build at http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()
