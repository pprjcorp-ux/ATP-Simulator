import unittest
from server.match import Match, trajectory


class MatchTests(unittest.TestCase):
    def test_reproducible_complete_match(self):
        a, b = Match(), Match()
        while not a.finished:
            a.next_game()
            b.next_game()
        self.assertEqual(a.events, b.events)
        self.assertEqual(max(a.sets), 2)
        self.assertEqual([e['seq'] for e in a.events], list(range(len(a.events))))
        self.assertTrue(all(a.events[i]['at'] <= a.events[i+1]['at'] for i in range(len(a.events)-1)))

    def test_deuce_needs_two_clear_points(self):
        m = Match()
        m.points = [3, 3]
        m.award(0, 'test')
        self.assertEqual(m.games, [0, 0])
        m.award(1, 'test')
        m.award(1, 'test')
        m.award(1, 'test')
        self.assertEqual(m.games, [0, 1])

    def test_flights_arrive_at_contact_or_bounce(self):
        m = Match()
        m.next_game()
        for event in m.events:
            if 'velocity' not in event:
                continue
            t = event['duration']
            for axis in range(3):
                end = event['start'][axis] + event['velocity'][axis]*t
                if axis == 1:
                    end -= 4.905*t*t
                self.assertAlmostEqual(end, event['end'][axis])
        self.assertTrue(any(e['kind'] == 'serve' for e in m.events))
        self.assertTrue(any(e['kind'] == 'return' for e in m.events))

    def test_tiebreak_service_order_and_two_point_margin(self):
        m = Match()
        m.tie_points = [0, 0]
        m.tie_first_server = 0
        m.award(0, 'test')
        self.assertEqual(m.server, 1)
        m.award(1, 'test')
        self.assertEqual(m.server, 1)
        m.award(0, 'test')
        self.assertEqual(m.server, 0)
        m.tie_points = [6, 6]
        m.award(0, 'test')
        self.assertEqual(m.sets, [0, 0])
        m.award(0, 'test')
        self.assertEqual(m.sets, [1, 0])
        self.assertIsNone(m.tie_points)

    def test_ability_changes_simulation_without_ranking_input(self):
        baseline, tired = Match(), Match()
        tired.profiles[0]['fatigue'] = 95
        baseline.next_game()
        tired.next_game()
        self.assertNotEqual(baseline.events, tired.events)

    def test_service_faults_and_change_of_ends(self):
        m = Match(3)
        m.rng.random = lambda: 0.0
        m.play_point()
        faults = [e for e in m.events if e['kind']=='serve_fault']
        doubles = [e for e in faults if e['attempt']==2]
        self.assertTrue(faults)
        self.assertTrue(doubles)
        for fault in doubles:
            next_event = m.events[fault['seq']+1]
            self.assertEqual(next_event['winner'], 1-fault['player'])
            self.assertEqual(next_event['reason'], 'double_fault')
        m = Match()
        for _ in range(4):
            m.award(0, 'test')
        self.assertEqual(m.end_sign, -1)
