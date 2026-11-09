import tempfile
import unittest
from pathlib import Path
from server.world import World
from server.career import ATTRIBUTES


class CareerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.now = [1000.0]
        self.world = World(str(Path(self.directory.name)/'world.sqlite3'), lambda: self.now[0])
        self.counter = 0

    def tearDown(self):
        self.world.db.close()
        self.directory.cleanup()

    def command(self, action, **values):
        self.counter += 1
        return self.world.career_command(dict(id=str(self.counter), athlete=0, action=action, **values))

    def test_equal_budget_contract_obligations_and_no_duplicate_money(self):
        with self.assertRaises(ValueError):
            self.command('create', name='A', attributes=dict.fromkeys(ATTRIBUTES, 80))
        self.command('create', name='A', attributes=dict.fromkeys(ATTRIBUTES, 60))
        with self.assertRaises(ValueError):
            self.command('sponsor', accept=True)
        self.command('equipment', model='control', tension=24)
        body = dict(id='contract', athlete=0, action='sponsor', accept=True)
        a = self.world.career_command(body)
        b = self.world.career_command(body)
        self.assertEqual(a, b)
        with self.assertRaises(ValueError):
            self.command('equipment', model='power', tension=24)
        self.assertEqual(len([x for x in self.world.career_snapshot()['ledger'] if x['reason']=='sponsor_signing']), 1)

    def test_week_progression_training_costs_prize_and_reconnect(self):
        before = self.world.career_snapshot()['athletes'][0]
        self.command('team', role='coach', hire=True)
        self.command('travel', destination='access-court')
        self.command('plan_week', gym=4, court=10, recovery=10, focus='backhand')
        with self.assertRaises(ValueError):
            self.command('plan_week', gym=4, court=10, recovery=10, focus='backhand')
        self.now[0] += 86400
        snapshot = self.world.career_snapshot()
        after = snapshot['athletes'][0]
        self.assertGreater(after['attributes']['backhand'], before['attributes']['backhand'])
        self.assertLess(after['balance_cents'], before['balance_cents'])
        self.assertEqual(sum(x['access_ticket'] for x in snapshot['athletes']), 1)
        self.assertEqual(snapshot, self.world.career_snapshot())
        for athlete in (0, 1):
            self.assertEqual(snapshot['athletes'][athlete]['balance_cents'], sum(x['cents'] for x in snapshot['ledger'] if x['athlete']==athlete))

    def test_restart_preserves_history_and_new_support(self):
        self.command('retire')
        data = self.command('restart')
        self.assertEqual(data['career_number'], 2)
        self.assertEqual(len(data['history']), 1)
        self.assertEqual(data['balance_cents'], 1200000)

        ledger = self.world.career_snapshot()['ledger']
        self.assertEqual(data['balance_cents'], sum(x['cents'] for x in ledger if x['athlete'] == 0 and x['career'] == 2))

    def test_creation_acknowledgement_survives_match_identity_lock(self):
        body = dict(id='create-once', athlete=0, action='create', name='A', attributes=dict.fromkeys(ATTRIBUTES, 60))
        accepted = self.world.career_command(body)
        self.now[0] = self.world.started + 1
        self.assertEqual(accepted, self.world.career_command(body))
        with self.assertRaises(ValueError):
            self.world.career_command(dict(body, id='create-during-match'))
