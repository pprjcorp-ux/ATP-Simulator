"""Authoritative development match. Coordinates are metres; time is seconds.
Balance parameters are provisional, not official ATP regulations.
"""
import random


def trajectory(start, end, duration):
    return [(end[i] - start[i]) / duration if i != 1 else
            (end[1] - start[1] + 4.905 * duration**2) / duration for i in range(3)]


class Match:
    def __init__(self, seed=2027):
        self.rng = random.Random(seed)
        self.events = []
        self.time = 0.0
        self.points = [0, 0]
        self.games = [0, 0]
        self.sets = [0, 0]
        self.server = 0
        self.end_sign = 1
        self.positions = [[1.5, 0, 12.5], [-1.5, 0, -12.5]]
        self.profiles = [dict(speed=60, fitness=60, forehand=60, fatigue=0, equipment='balanced', tension=24) for _ in range(2)]
        self.plans = [dict(intensity=0.6, aggression=0.5) for _ in range(2)]
        self.game_number = 0
        self.finished = False
        self.tie_points = None
        self.tie_first_server = 0
        self.emit('ready')

    def emit(self, kind, **data):
        event = dict(seq=len(self.events), at=round(self.time, 4), kind=kind,
                     points=self.points.copy(), games=self.games.copy(), sets=self.sets.copy(),
                     server=self.server, game_number=self.game_number, **data)
        self.events.append(event)
        return event

    def flight(self, start, end, duration, kind, player):
        targets = [p.copy() for p in self.positions]
        if kind in ('serve', 'return', 'stroke') and abs(end[0]) <= 4.115:
            receiver = 1-player
            receive_x = end[0] * (1.4 if kind == 'serve' else 1.05)
            targets[receiver] = [receive_x - 0.55, 0, -12.4*self.end_sign if receiver == 1 else 12.4*self.end_sign]
        if kind == 'rebound':
            targets[player] = [end[0]-0.55, 0, end[2]+(0.4*self.end_sign if player == 0 else -0.4*self.end_sign)]
        self.emit(kind, player=player, start=start, end=end, move_targets=targets,
                  duration=duration, velocity=trajectory(start, end, duration),
                  positions=[p.copy() for p in self.positions])
        for index in (0, 1):
            speed = (4+self.profiles[index]['speed']/30)*(0.7+self.plans[index]['intensity']*0.5)*(1-self.profiles[index]['fatigue']/250)
            distance = sum((targets[index][axis]-self.positions[index][axis])**2 for axis in (0, 2))**0.5
            fraction = min(1, speed*duration/distance) if distance else 1
            targets[index] = [self.positions[index][axis]+(targets[index][axis]-self.positions[index][axis])*fraction for axis in range(3)]
        # The event owns a reference to move_targets; render the exact same displacement.
        self.positions = [p.copy() for p in targets]
        self.time += duration

    def play_point(self):
        hitter = self.server
        side = self.end_sign if hitter == 0 else -self.end_sign
        court_side = 1 if sum(self.tie_points or self.points) % 2 == 0 else -1
        self.positions[hitter] = [1.5 * court_side * side, 0, 12.5 * side]
        self.positions[1-hitter] = [-1.5 * court_side * side, 0, -12.5 * side]
        # Both serves are simulated; a service fault never awards an ordinary point.
        for attempt in (1, 2):
            origin = [self.positions[hitter][0]+0.55, 1.2, 12.1*side]
            contact = [origin[0], 2.8, origin[2]]
            self.flight(origin, contact, 0.7, 'toss', hitter)
            skill = self.profiles[hitter].get('serve', 60)
            fault_chance = max(0.015, (0.12 if attempt == 1 else 0.045)+(60-skill)*0.001)
            fault = self.rng.random() < fault_chance
            target = [-court_side*side*self.rng.uniform(1, 3), 0.034, (-7.2 if fault else -4.8)*side]
            self.flight(contact, target, 0.66 if attempt == 1 else 0.82, 'serve', hitter)
            self.emit('bounce', position=target)
            if not fault:
                break
            self.emit('serve_fault', player=hitter, attempt=attempt, reason='service_long')
            self.time += 1.5
            if attempt == 2:
                self.award(1-hitter, 'double_fault')
                self.time += 2.5
                return
        # Receive after the bounce; racket position is derived from contact.
        contact = [target[0] * 1.4, 1.05, -11.4 * side]
        self.flight(target, contact, 0.58, 'rebound', 1-hitter)
        hitter = 1-hitter
        stroke = 0
        while True:
            side = self.end_sign if hitter == 0 else -self.end_sign
            self.positions[hitter] = [contact[0] - 0.55, 0, contact[2] + 0.4 * side]
            plan = self.plans[hitter]
            # Aiming and errors depend on the active server-side plan.
            profile = self.profiles[hitter]
            skill = profile['forehand'] - profile['fatigue'] * 0.12
            control = 0.02 if profile['equipment'] == 'control' else -0.02 if profile['equipment'] == 'power' else 0
            error = self.rng.random() < max(0.03, 0.08 + plan['aggression'] * 0.10 + (60-skill)*0.003 - control)
            x = self.rng.uniform(-3.7, 3.7)
            target = [x if not error else 5.0, 0.034, -side * self.rng.uniform(7.0, 10.2)]
            self.flight(contact, target, 0.88 - plan['intensity'] * 0.12,
                        'return' if stroke == 0 else 'stroke', hitter)
            self.emit('bounce', position=target)
            if error:
                winner = 1-hitter
                reason = 'wide'
                break
            contact = [x * 1.05, 1.05, -side * 12.0]
            receiver = 1-hitter
            desired = [contact[0]-0.55, 0, contact[2]-0.4*side]
            distance = sum((desired[i]-self.positions[receiver][i])**2 for i in (0, 2))**0.5
            capacity = self.profiles[receiver]
            speed = (4 + capacity['speed']/30) * (0.7 + self.plans[receiver]['intensity']*0.5) * (1-capacity['fatigue']/250)
            available = 0.42
            if distance > speed*available:
                self.flight(target, contact, 0.42, 'rebound', receiver)
                landing = [contact[0], 0.034, contact[2]-side*2]
                self.flight(contact, landing, 0.44, 'unreached', receiver)
                self.emit('bounce', position=landing)
                winner, reason = hitter, 'second_bounce'
                break
            self.flight(target, contact, 0.42, 'rebound', receiver)
            self.positions[receiver] = desired
            hitter = receiver
            stroke += 1
        self.award(winner, reason)
        self.time += 2.5

    def award(self, winner, reason):
        if self.tie_points is not None:
            self.award_tiebreak(winner, reason)
            return
        self.points[winner] += 1
        self.emit('point', winner=winner, reason=reason)
        other = 1-winner
        if self.points[winner] >= 4 and self.points[winner]-self.points[other] >= 2:
            self.games[winner] += 1
            self.points = [0, 0]
            self.game_number += 1
            if self.game_number % 2 == 1:
                self.end_sign *= -1
            self.server = 1-self.server
            self.emit('game', winner=winner)
            # Standard set threshold, tie-break implemented separately below.
            if self.games[winner] >= 6 and self.games[winner]-self.games[other] >= 2:
                self.sets[winner] += 1
                self.emit('set', winner=winner)
                self.games = [0, 0]
                if self.sets[winner] == 2:
                    self.finished = True
                    self.emit('finished', winner=winner)
            elif self.games == [6, 6]:
                self.tie_points = [0, 0]
                self.tie_first_server = self.server
                self.emit("tiebreak_start", tiebreak=self.tie_points.copy())

    def award_tiebreak(self, winner, reason):
        self.tie_points[winner] += 1
        self.emit('tiebreak_point', winner=winner, reason=reason, tiebreak=self.tie_points.copy())
        total = sum(self.tie_points)
        if total % 6 == 0:
            self.end_sign *= -1
        self.server = self.tie_first_server if ((total + 1) // 2) % 2 == 0 else 1-self.tie_first_server
        if self.tie_points[winner] >= 7 and self.tie_points[winner]-self.tie_points[1-winner] >= 2:
            self.games[winner] += 1
            self.sets[winner] += 1
            self.emit('set', winner=winner, tiebreak=self.tie_points.copy())
            self.games = [0, 0]
            self.tie_points = None
            self.server = 1-self.tie_first_server
            self.game_number += 1
            if self.game_number % 2 == 1:
                self.end_sign *= -1
            if self.sets[winner] == 2:
                self.finished = True
                self.emit('finished', winner=winner)

    def next_game(self):
        game = self.game_number
        while not self.finished and self.game_number == game:
            self.play_point()
        if not self.finished:
            self.emit('instruction_window', closes_at=self.time + 12)
            self.time += 12
