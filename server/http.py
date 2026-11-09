"""Local cloud development service; not a public authenticated deployment."""
import argparse
import json
import os
import secrets
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, parse_qs
from server.world import World


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='world.sqlite3')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--local-mvp', action='store_true')
    parser.add_argument('--ready-file')
    parser.add_argument('--owner-pid', type=int)
    args = parser.parse_args()
    token = secrets.token_urlsafe(32) if args.local_mvp else ''
    lock = None
    if args.local_mvp and os.name == 'posix':
        import fcntl
        lock = open(args.database+'.lock', 'a')
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Esta carreira já está aberta em outra janela.')
    world = World(args.database, sandbox=args.local_mvp)

    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, value):
            data = json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            if token and not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+token):
                self.respond(401, {'error': 'local session token required'})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path == '/career':
                return self.respond(200, world.career_snapshot())
            url = urlsplit(self.path)
            if url.path != '/match':
                return self.respond(404, {'error': 'not found'})
            try:
                after = int(parse_qs(url.query).get('after', ['-1'])[0])
                self.respond(200, world.snapshot(after))
            except ValueError:
                self.respond(400, {'error': 'invalid event cursor'})

        def do_POST(self):
            if not self.authorized():
                return
            if self.path not in ('/instruction', '/career', '/schedule', '/local'):
                return self.respond(404, {'error': 'not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('invalid body size')
                command = json.loads(self.rfile.read(size))
                if not isinstance(command, dict):
                    raise ValueError('invalid command')
                if self.path == '/local':
                    response = world.local_action(command)
                elif self.path == '/schedule':
                    response = world.schedule_next(command)
                elif self.path == '/instruction':
                    response = world.instruction(command)
                else:
                    response = world.career_command(command)
                self.respond(200, response)
            except (ValueError, TypeError) as error:
                self.respond(400, {'error': str(error)})

    http = HTTPServer(('127.0.0.1', args.port), Handler)
    endpoint = f'http://127.0.0.1:{http.server_port}'
    if args.ready_file:
        path = Path(args.ready_file)
        with open(path, 'w', opener=lambda p, flags: os.open(p, flags, 0o600)) as ready:
            json.dump(dict(url=endpoint, token=token), ready)
    print(f'Authority listening on {endpoint}', flush=True)
    if args.owner_pid:
        def watch_owner():
            import time
            while True:
                time.sleep(1)
                try:
                    os.kill(args.owner_pid, 0)
                except ProcessLookupError:
                    http.shutdown()
                    return
        threading.Thread(target=watch_owner, daemon=True).start()
    try:
        http.serve_forever()
    finally:
        http.server_close()
        world.db.close()
        if args.ready_file:
            Path(args.ready_file).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
