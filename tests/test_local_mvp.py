import json
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from server.world import World
from server.career import ATTRIBUTES


class LocalMVPTests(unittest.TestCase):
    def test_prepare_play_result_week_and_resume(self):
        with tempfile.TemporaryDirectory() as d:
            now = [1000.0]
            path = str(Path(d)/'mvp.sqlite3')
            w = World(path, lambda: now[0], sandbox=True)
            self.assertTrue(w.snapshot()['waiting'])
            with self.assertRaises(ValueError):
                w.local_action(dict(id='start-before-create', action='start'))
            w.career_command(dict(id='create', athlete=0, action='create', name='Meu atleta', attributes=dict.fromkeys(ATTRIBUTES,60)))
            w.career_command(dict(id='travel', athlete=0, action='travel', destination='access-court'))
            command = dict(id='start', action='start')
            started = w.local_action(command)
            self.assertEqual(started, w.local_action(command))
            now[0] += 4
            w.tick()
            with self.assertRaises(ValueError):
                w.local_action(dict(id='week-during-match', action='week'))
            now[0] += 10000
            before = w.career_snapshot()
            self.assertEqual(len(before['results']), 1)
            w.local_action(dict(id='week', action='week'))
            after = w.career_snapshot()
            self.assertEqual(after['week'], 1)
            self.assertNotEqual(before['athletes'][0]['balance_cents'], after['athletes'][0]['balance_cents'])
            w.db.close()
            w = World(path, lambda: now[0], sandbox=True)
            self.assertEqual(after, w.career_snapshot())
            w.db.close()

    def test_bundled_launcher_ephemeral_port_and_token(self):
        with tempfile.TemporaryDirectory() as d:
            ready = Path(d)/'ready.json'
            p = subprocess.Popen([sys.executable, '-I', '-B', 'server/launcher.py', '--local-mvp', '--port', '0', '--database', str(Path(d)/'mvp.sqlite3'), '--ready-file', str(ready)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                for _ in range(100):
                    if ready.exists():
                        break
                    if p.poll() is not None:
                        self.fail(p.stderr.read().decode())
                    time.sleep(.02)
                self.assertTrue(ready.exists())
                session = json.loads(ready.read_text())
                with self.assertRaises(urllib.error.HTTPError) as e:
                    urllib.request.urlopen(session['url']+'/career')
                self.assertEqual(e.exception.code, 401)
                request = urllib.request.Request(session['url']+'/career', headers={'Authorization':'Bearer '+session['token']})
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(json.load(response)['mode'], 'local-mvp')
            finally:
                p.terminate()
                p.wait(timeout=5)
                p.stderr.close()
