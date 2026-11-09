"""Single authority backed by SQLite. Development identities only, loopback only."""
import json
import sqlite3
import time
from server.match import Match
from server import career


def tuples(value):
    return tuple(tuples(x) for x in value) if isinstance(value, list) else value


class World:
    def __init__(self, path, clock=time.time):
        self.clock = clock
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY, state TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, body TEXT, response TEXT)')
        career.bootstrap(self.db)
        self.db.execute('CREATE TABLE IF NOT EXISTS clock (id INTEGER PRIMARY KEY, epoch REAL, week INTEGER)')
        self.db.execute('INSERT OR IGNORE INTO clock VALUES (1, ?, 0)', (clock(),))
        self.db.commit()
        row = self.db.execute('SELECT state FROM world WHERE id=1').fetchone()
        self.match = Match()
        self.fixture = "development-access-2027"
        if row:
            state = json.loads(row[0])
            self.started = state.pop('started')
            self.fixture = state.pop('fixture', 'development-access-2027')
            self.match.rng.setstate(tuples(state.pop('rng')))
            self.match.__dict__.update(state)
        else:
            self.started = clock() + 60
            self.save()

    def save(self):
        state = {k: v for k, v in self.match.__dict__.items() if k != 'rng'}
        state.update(started=self.started, fixture=self.fixture, rng=self.match.rng.getstate())
        self.db.execute('INSERT OR REPLACE INTO world VALUES (1, ?)', (json.dumps(state),))
        self.db.commit()

    def tick(self):
        elapsed = self.clock()-self.started
        while not self.match.finished and elapsed >= self.match.time:
            if self.match.game_number == 0 and len(self.match.events) == 1:
                for athlete in (0, 1):
                    data = career.get(self.db, athlete)
                    self.match.profiles[athlete] = dict(data['attributes'], fatigue=data['fatigue'], equipment=data['equipment'], tension=data['tension'])
            self.match.next_game()
            self.save()
        finished = [e for e in self.match.events if e['kind'] == 'finished' and e['at'] <= elapsed]
        if finished and not self.db.execute("SELECT 1 FROM results WHERE id=?", (self.fixture,)).fetchone():
            with self.db:
                result = finished[-1]
                self.db.execute('INSERT INTO results VALUES (?,?)', (self.fixture, json.dumps(result)))
                for athlete in (0, 1):
                    data = career.get(self.db, athlete)
                    data['fatigue'] = min(100, data['fatigue'] + len([e for e in self.match.events if e['kind'] in ('stroke', 'return')])*0.04*self.match.plans[athlete]['intensity'])
                    if athlete == result['winner']:
                        data['access_ticket'] = True
                        career.money(self.db, athlete, data, 40000, 'prize:'+self.fixture, 'access_prize')
                    career.put(self.db, athlete, data)
        epoch, week = self.db.execute('SELECT epoch,week FROM clock WHERE id=1').fetchone()
        due_week = max(week, int((self.clock()-epoch)//86400))
        with self.db:
            for completed in range(week, due_week):
                career.settle_week(self.db, completed)
            self.db.execute('UPDATE clock SET week=? WHERE id=1', (due_week,))
        return elapsed

    def snapshot(self, after=-1):
        elapsed = self.tick()
        events = [e for e in self.match.events if e['at'] <= elapsed]
        return dict(server_time=self.clock(), started=self.started, elapsed=max(0, elapsed),
                    events=[e for e in events if e['seq'] > after],
                    last_seq=events[-1]['seq'] if events else -1,
                    fixture=self.fixture, data_status='fictional-test',
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
        if command.get('fixture') != self.fixture:
            raise ValueError('instruction belongs to another fixture')
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

    def career_snapshot(self):
        self.tick()
        return dict(week=self.db.execute('SELECT week FROM clock WHERE id=1').fetchone()[0],
                    season=2027, balance_status='provisional',
                    athletes=[career.get(self.db, athlete) for athlete in (0, 1)],
                    ledger=[dict(id=r[0], athlete=r[1], cents=r[2], reason=r[3], career=r[4]) for r in self.db.execute('SELECT * FROM ledger')])

    def career_command(self, body):
        self.tick()
        week = self.db.execute('SELECT week FROM clock WHERE id=1').fetchone()[0]
        if self.db.execute('SELECT 1 FROM career_commands WHERE id=?', (body.get('id'),)).fetchone():
            with self.db:
                return career.command(self.db, body, week)
        if body.get('action') in ('create', 'retire', 'restart') and self.started <= self.clock() and not (self.match.finished and self.clock() >= self.started+self.match.time):
            raise ValueError('athlete identity locked during scheduled match')
        with self.db:
            return career.command(self.db, body, week)

    def schedule_next(self, command):
        key = command.get('id')
        if not isinstance(key, str) or not 1 <= len(key) <= 100:
            raise ValueError('invalid command id')
        raw = json.dumps(dict(command, action='schedule'), sort_keys=True)
        prior = self.db.execute('SELECT body,response FROM commands WHERE id=?', (key,)).fetchone()
        if prior:
            if prior[0] != raw:
                raise ValueError('command id conflict')
            return json.loads(prior[1])
        self.tick()
        if not self.match.finished or self.clock() < self.started+self.match.time:
            raise ValueError('current match has not finished')
        entrants = [career.get(self.db, athlete) for athlete in (0, 1)]
        if any(a['retired'] or a['location'] != 'access-court' for a in entrants):
            raise ValueError('both active athletes must travel to access court')
        number = self.db.execute('SELECT COUNT(*) FROM results').fetchone()[0]+1
        self.fixture = f'development-access-2027-{number}'
        plans = [p.copy() for p in self.match.plans]
        self.match = Match(seed=2027+number)
        self.match.plans = plans
        self.started = self.clock()+60
        response = dict(fixture=self.fixture, starts_at=self.started)
        self.db.execute('INSERT INTO commands VALUES (?,?,?)', (key, raw, json.dumps(response)))
        self.save()
        return response
