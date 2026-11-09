"""Provisional game balance, fictional test economy; never official ATP data."""
import json

ATTRIBUTES = ('serve', 'forehand', 'backhand', 'return', 'fitness', 'speed')
BUDGET = 360
INITIAL_CENTS = 1200000


def bootstrap(db):
    db.execute('CREATE TABLE IF NOT EXISTS athletes (id INTEGER PRIMARY KEY, data TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, athlete INTEGER, cents INTEGER, reason TEXT)')
    if 'career' not in [row[1] for row in db.execute('PRAGMA table_info(ledger)')]:
        db.execute('ALTER TABLE ledger ADD COLUMN career INTEGER NOT NULL DEFAULT 1')
    db.execute('CREATE TABLE IF NOT EXISTS career_commands (id TEXT PRIMARY KEY, body TEXT, response TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, data TEXT)')
    for athlete in (0, 1):
        if not db.execute('SELECT 1 FROM athletes WHERE id=?', (athlete,)).fetchone():
            data = dict(name=f'Atleta de teste {athlete+1}', attributes=dict.fromkeys(ATTRIBUTES, 60),
                        fatigue=0.0, balance_cents=INITIAL_CENTS, coach=False, physio=False,
                        location='academy', equipment='balanced', tension=24,
                        sponsor=None, access_ticket=False, history=[], training_hours=0,
                        retired=False, career_number=1)
            put(db, athlete, data)
            db.execute('INSERT INTO ledger (id,athlete,cents,reason,career) VALUES (?,?,?,?,?)',
                       (f'initial:{athlete}:1', athlete, INITIAL_CENTS, 'limited_starting_support', 1))


def get(db, athlete):
    if type(athlete) is not int or athlete not in (0, 1):
        raise ValueError('invalid athlete')
    return json.loads(db.execute('SELECT data FROM athletes WHERE id=?', (athlete,)).fetchone()[0])


def put(db, athlete, data):
    db.execute('INSERT OR REPLACE INTO athletes VALUES (?,?)', (athlete, json.dumps(data)))


def money(db, athlete, data, cents, key, reason):
    if cents < 0 and data['balance_cents'] + cents < 0:
        raise ValueError('insufficient funds')
    db.execute('INSERT INTO ledger (id,athlete,cents,reason,career) VALUES (?,?,?,?,?)', (key, athlete, cents, reason, data['career_number']))
    data['balance_cents'] += cents


def command(db, body, world_week):
    key = body.get('id')
    if not isinstance(key, str) or not 1 <= len(key) <= 100:
        raise ValueError('invalid command id')
    raw = json.dumps(body, sort_keys=True)
    prior = db.execute('SELECT body,response FROM career_commands WHERE id=?', (key,)).fetchone()
    if prior:
        if prior[0] != raw:
            raise ValueError('command id conflict')
        return json.loads(prior[1])
    athlete = body.get('athlete')
    data = get(db, athlete)
    action = body.get('action')
    if data['retired'] and action != 'restart':
        raise ValueError('career retired')
    if action == 'create':
        if data.get('customized'):
            raise ValueError('athlete already created')
        attrs = body.get('attributes', {})
        name = body.get('name', '')
        if (set(attrs) != set(ATTRIBUTES) or any(type(x) is not int or not 40 <= x <= 80 for x in attrs.values())
                or sum(attrs.values()) != BUDGET or not isinstance(name, str) or not 1 <= len(name.strip()) <= 40):
            raise ValueError('invalid name or attribute budget')
        data.update(name=name.strip(), attributes=attrs, customized=True)
    elif action == 'plan_week':
        if data.get('planned_week') == world_week:
            raise ValueError('week already planned')
        gym, court, recovery = (body.get(x) for x in ('gym', 'court', 'recovery'))
        if any(type(x) is not int or x < 0 for x in (gym, court, recovery)) or gym+court+recovery != 24:
            raise ValueError('allocate exactly 24 weekly hours')
        focus = body.get('focus')
        if focus not in ATTRIBUTES:
            raise ValueError('invalid focus')
        data['schedule'] = dict(gym=gym, court=court, recovery=recovery, focus=focus)
        data['planned_week'] = world_week
    elif action == 'team':
        role = body.get('role')
        if role not in ('coach', 'physio') or type(body.get('hire')) is not bool:
            raise ValueError('invalid team choice')
        if data[role] == body['hire']:
            raise ValueError('team choice already active')
        if body['hire']:
            money(db, athlete, data, -15000 if role == 'coach' else -10000, key, 'team_signing')
        data[role] = body['hire']
    elif action == 'travel':
        destination = body.get('destination')
        if destination not in ('academy', 'access-court') or data['location'] == destination:
            raise ValueError('invalid travel destination')
        money(db, athlete, data, -25000, key, 'travel_and_lodging')
        data['location'] = destination
        data['fatigue'] = min(100, data['fatigue']+8)
    elif action == 'equipment':
        model, tension = body.get('model'), body.get('tension')
        if model not in ('balanced', 'control', 'power') or type(tension) is not int or not 18 <= tension <= 30:
            raise ValueError('invalid equipment')
        if data['sponsor'] and model != 'control':
            raise ValueError('sponsor equipment obligation')
        money(db, athlete, data, -18000, key, 'racket_and_strings')
        data.update(equipment=model, tension=tension)
    elif action == 'sponsor':
        if data['sponsor']:
            raise ValueError('contract already active')
        if body.get('accept') is True:
            if data['equipment'] != 'control':
                raise ValueError('contract requires control equipment')
            data['sponsor'] = dict(expires_week=world_week+4, required_equipment='control', weekly_cents=15000)
            money(db, athlete, data, 30000, key, 'sponsor_signing')
        elif body.get('accept') is not False:
            raise ValueError('invalid sponsor decision')
    elif action == 'retire':
        data['retired'] = True
        data['history'].append(dict(career=data['career_number'], name=data['name'], week=world_week,
                                    balance_cents=data['balance_cents']))
    elif action == 'restart':
        if not data['retired']:
            raise ValueError('retire first')
        number = data['career_number']+1
        history = data['history']
        data = dict(name='Novo atleta', attributes=dict.fromkeys(ATTRIBUTES, 60), fatigue=0.0,
                    balance_cents=0, coach=False, physio=False, location='academy', equipment='balanced',
                    tension=24, sponsor=None, access_ticket=False, history=history, training_hours=0,
                    retired=False, career_number=number)
        money(db, athlete, data, INITIAL_CENTS, key, 'new_career_support')
    else:
        raise ValueError('unknown career action')
    put(db, athlete, data)
    db.execute('INSERT INTO career_commands VALUES (?,?,?)', (key, raw, json.dumps(data)))
    return data


def settle_week(db, week):
    for athlete in (0, 1):
        data = get(db, athlete)
        if data['retired']:
            continue
        plan = data.get('schedule', dict(gym=4, court=8, recovery=12, focus='forehand'))
        efficiency = max(0.2, 1-data['fatigue']/120) * (1.2 if data['coach'] else 1)
        for attr, hours in (('fitness', plan['gym']), (plan['focus'], plan['court'])):
            data['attributes'][attr] = min(90, data['attributes'][attr]+hours*0.015*efficiency)
        data['training_hours'] += plan['gym']+plan['court']
        data['fatigue'] = max(0, min(100, data['fatigue'] + (plan['gym']+plan['court'])*0.7
                                      - plan['recovery']*(1.5 if data['physio'] else 1.1)))
        cost = 5000 + (20000 if data['coach'] else 0) + (12000 if data['physio'] else 0)
        # Insolvency is visible; mandatory obligations may put the career in debt.
        data['balance_cents'] -= cost
        db.execute('INSERT INTO ledger (id,athlete,cents,reason,career) VALUES (?,?,?,?,?)', (f'week:{week}:{athlete}', athlete, -cost, 'weekly_costs', data['career_number']))
        if data['sponsor']:
            if week < data['sponsor']['expires_week']:
                money(db, athlete, data, data['sponsor']['weekly_cents'], f'sponsor:{week}:{athlete}', 'sponsor_weekly')
            else:
                data['sponsor'] = None
        put(db, athlete, data)
