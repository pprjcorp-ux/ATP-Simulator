import tempfile
import unittest
from pathlib import Path
from server.world import World


class WorldTests(unittest.TestCase):
    def test_two_clients_reconnect_no_future_and_absence(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000.0]
            path = str(Path(directory)/'world.sqlite3')
            w = World(path, lambda: now[0])
            for _ in range(500):
                a, b = w.snapshot(), w.snapshot()
                self.assertEqual(a, b)
                self.assertTrue(all(e['at'] <= a['elapsed'] for e in a['events']))
                now[0] += 20
            before = w.snapshot()
            w.db.close()
            restored = World(path, lambda: now[0])
            self.assertEqual(before, restored.snapshot())
            self.assertTrue(any(e['kind'] == 'finished' for e in before['events']))

    def test_instruction_deadline_idempotence_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000.0]
            path = str(Path(directory)/'world.sqlite3')
            w = World(path, lambda: now[0])
            command = dict(id='one', player=0, game_number=1,
                           plan=dict(intensity=0.8, aggression=0.2))
            with self.assertRaises(ValueError):
                w.instruction(command)
            window = w.match.events[-1]
            now[0] = w.started + window['at'] + 1
            accepted = w.instruction(command)
            now[0] += 100
            self.assertEqual(accepted, w.instruction(command))
            with self.assertRaises(ValueError):
                w.instruction(dict(command, id='late'))
            w.db.close()
            w = World(path, lambda: now[0])
            self.assertEqual(accepted, w.instruction(command))
            self.assertEqual(w.match.plans[0], command['plan'])
