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
