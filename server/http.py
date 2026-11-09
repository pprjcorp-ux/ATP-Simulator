"""Local cloud development service; not a public authenticated deployment."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit, parse_qs
from server.world import World


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='world.sqlite3')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    world = World(args.database)

    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, value):
            data = json.dumps(value).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
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
            if self.path not in ('/instruction', '/career', '/schedule'):
                return self.respond(404, {'error': 'not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('invalid body size')
                command = json.loads(self.rfile.read(size))
                if not isinstance(command, dict):
                    raise ValueError('invalid command')
                if self.path == '/schedule':
                    response = world.schedule_next(command)
                elif self.path == '/instruction':
                    response = world.instruction(command)
                else:
                    response = world.career_command(command)
                self.respond(200, response)
            except (ValueError, TypeError) as error:
                self.respond(400, {'error': str(error)})

    print(f'Authority listening on http://127.0.0.1:{args.port}', flush=True)
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
