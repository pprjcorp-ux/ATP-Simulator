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
            command = dict(id='one', player=0, game_number=1, fixture=w.fixture,
                           plan=dict(intensity=0.8, aggression=0.2))
            with self.assertRaises(ValueError):
                w.instruction(command)
            now[0] = w.started
            w.tick()
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

    def test_next_fixture_and_incremental_reconnection(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000.0]
            w = World(str(Path(directory)/'world.sqlite3'), lambda: now[0])
            now[0] = w.started + 10000
            first = w.snapshot()
            self.assertEqual(w.snapshot(first['last_seq'])['events'], [])
            for athlete in (0, 1):
                w.career_command(dict(id=f'travel-{athlete}', athlete=athlete, action='travel', destination='access-court'))
            command = dict(id='schedule-two')
            scheduled = w.schedule_next(command)
            self.assertEqual(scheduled, w.schedule_next(command))
            self.assertNotEqual(first['fixture'], scheduled['fixture'])
            now[0] += 10000
            second = w.snapshot()
            self.assertTrue(any(e['kind']=='finished' for e in second['events']))
            self.assertEqual(w.db.execute('SELECT COUNT(*) FROM results').fetchone()[0], 2)
            self.assertEqual(w.db.execute("SELECT COUNT(*) FROM ledger WHERE reason='access_prize'").fetchone()[0], 2)
