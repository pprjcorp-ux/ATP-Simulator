"""Single authority backed by SQLite. Development identities only, loopback only."""
import json
import sqlite3
import time
from server.match import Match


def tuples(value):
    return tuple(tuples(x) for x in value) if isinstance(value, list) else value


class World:
    def __init__(self, path, clock=time.time):
        self.clock = clock
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY, state TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, body TEXT, response TEXT)')
        row = self.db.execute('SELECT state FROM world WHERE id=1').fetchone()
        self.match = Match()
        if row:
            state = json.loads(row[0])
            self.started = state.pop('started')
            self.match.rng.setstate(tuples(state.pop('rng')))
            self.match.__dict__.update(state)
        else:
            self.started = clock() + 3
            self.match.next_game()
            self.save()

    def save(self):
        state = {k: v for k, v in self.match.__dict__.items() if k != 'rng'}
        state.update(started=self.started, rng=self.match.rng.getstate())
        self.db.execute('INSERT OR REPLACE INTO world VALUES (1, ?)', (json.dumps(state),))
        self.db.commit()

    def tick(self):
        elapsed = self.clock()-self.started
        while not self.match.finished and elapsed >= self.match.time:
            self.match.next_game()
            self.save()
        return elapsed

    def snapshot(self, after=-1):
        elapsed = self.tick()
        events = [e for e in self.match.events if e['at'] <= elapsed]
        return dict(server_time=self.clock(), started=self.started, elapsed=max(0, elapsed),
                    events=[e for e in events if e['seq'] > after],
                    last_seq=events[-1]['seq'] if events else -1,
                    fixture='development-access-2027', data_status='fictional-test',
                    players=['Atleta de teste A', 'Atleta de teste B'])

    def instruction(self, command):
        raw = json.dumps(command, sort_keys=True)
        command_id = command.get('id')
        if not isinstance(command_id, str) or not 1 <= len(command_id) <= 100:
            raise ValueError('invalid command id')
        prior = self.db.execute('SELECT body,response FROM commands WHERE id=?', (command_id,)).fetchone()
        if prior:
            if prior[0] != raw:
                raise ValueError('command id conflict')
            return json.loads(prior[1])
        elapsed = self.tick()
        windows = [e for e in self.match.events if e['kind'] == 'instruction_window' and e['at'] <= elapsed < e['closes_at']]
        player = command.get('player')
        if type(player) is not int or player not in (0, 1):
            raise ValueError('invalid player')
        if not windows or command.get('game_number') != windows[-1]['game_number']:
            raise ValueError('instruction window closed')
        plan = command.get('plan', {})
        if set(plan) != {'intensity', 'aggression'}:
            raise ValueError('invalid plan')
        if any(type(v) not in (int, float) or not 0 <= v <= 1 for v in plan.values()):
            raise ValueError('invalid plan value')
        self.match.plans[player] = plan.copy()
        response = dict(accepted=True, effective_game=windows[-1]['game_number'] + 1)
        self.db.execute('INSERT INTO commands VALUES (?,?,?)', (command_id, raw, json.dumps(response)))
        self.save()
        return response
