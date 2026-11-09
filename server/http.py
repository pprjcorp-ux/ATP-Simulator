"""Local cloud development service; not a public authenticated deployment."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
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
            if self.path != '/match':
                return self.respond(404, {'error': 'not found'})
            self.respond(200, world.snapshot())

        def do_POST(self):
            if self.path != '/instruction':
                return self.respond(404, {'error': 'not found'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('invalid body size')
                command = json.loads(self.rfile.read(size))
                if not isinstance(command, dict):
                    raise ValueError('invalid command')
                self.respond(200, world.instruction(command))
            except (ValueError, TypeError) as error:
                self.respond(400, {'error': str(error)})

    print(f'Authority listening on http://127.0.0.1:{args.port}', flush=True)
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
