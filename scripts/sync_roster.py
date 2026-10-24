"""Adds heroes and beasts that are new in the game to data/, with portraits.

Reads the public unit database mirrored at github.com/floofpire/cdn (pulled from
Lilith's CDN), finds ascended-tier heroes that data/heroes.json does not have
yet, downloads their 200px icons and stores 128px WebP copies in img/heroes/.
New entries get name, faction, type and game-data roles; their class, kit and
ratings still need research, so they are marked "needsReview": true.

Run with:  python3 scripts/sync_roster.py          (dry run, lists new heroes)
           python3 scripts/sync_roster.py --write  (adds them)
Needs Pillow for --write.
"""
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CDN = 'https://raw.githubusercontent.com/floofpire/cdn/main/'
TYPE = {'tank': 'Strength', 'archer': 'Agility', 'magician': 'Intelligence'}
ROLE = {
    'Continuous Damage': 'sustained-dps', 'Tank': 'tank', 'Buff': 'buffer', 'Burst Damage': 'burst',
    'Control': 'cc', 'Heal': 'healer', 'Assassin': 'assassin', 'Debuff': 'debuffer', 'AoE': 'aoe',
}


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def main():
    write = '--write' in sys.argv
    path = ROOT / 'data' / 'heroes.json'
    doc = json.loads(path.read_text())
    have_ids = {h['id'] for h in doc['heroes']}
    have_game = {h.get('gameId') for h in doc['heroes']}
    units = json.loads(get(CDN + 'unit.json'))
    new = []
    for u in units.values():
        # Heroes have ids below 1000; elite/legendary internal rarity = ascended tier.
        if u['id'] >= 1000 or u['id'] in have_game or u.get('rarity') not in ('elite', 'legendary'):
            continue
        name = u['names']['en']
        if u.get('isAwakened') and slug('awakened ' + name) not in have_ids and any(x.get('gameId') != u['id'] and slug(x['name']) == slug(name) for x in doc['heroes']):
            name = 'Awakened ' + name
        hid = slug(name)
        if hid in have_ids:
            hid = f"{hid}-{u['id']}"
        roles = [ROLE[r] for r in (u.get('mainRole'), u.get('secondRole')) if r in ROLE]
        new.append({
            'id': hid, 'name': name, 'title': None, 'faction': u['faction'],
            'class': 'Tank' if 'tank' in roles else 'Warrior',
            'type': TYPE.get(u.get('job')), 'release': None, 'awakened': bool(u.get('isAwakened')), 'isNew': True,
            'img': f'img/heroes/{hid}.webp', 'roles': roles, 'position': 'front' if 'tank' in roles else 'back',
            'kit': None, 'kitConfidence': 'low', 'synergies': [], 'counters': [], 'counteredBy': [],
            'investment': None, 'modes': [], 'tiers': {}, 'raw': {}, 'consensus': None, 'trend': None,
            'tierNote': None, 'gameId': u['id'], 'needsReview': True,
        })
    for h in new:
        print(f"new: {h['name']} ({h['faction']}, game id {h['gameId']})")
    if not new:
        print('roster is up to date')
        return
    if not write:
        print('dry run: pass --write to add them')
        return
    from PIL import Image
    for h in new:
        try:
            raw = get(f"{CDN}unit_icon_by_id/{h['gameId']}_2x.webp")
            im = Image.open(io.BytesIO(raw)).convert('RGBA').resize((128, 128), Image.LANCZOS)
            im.save(ROOT / h['img'], 'WEBP', quality=82, method=6)
        except Exception as e:  # keep the hero; the page falls back to initials
            print(f"  no portrait for {h['name']}: {e}")
            h['img'] = None
    doc['heroes'] = sorted(doc['heroes'] + new, key=lambda x: x['name'])
    doc['count'] = len(doc['heroes'])
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(f'added {len(new)} heroes. Set their class, release month, kit and ratings, then remove needsReview.')


def sync_beasts(units, write):
    path = ROOT / 'data' / 'beasts.json'
    doc = json.loads(path.read_text())
    have = {b['gameId'] for b in doc['beasts']}
    new = []
    for u in sorted(units.values(), key=lambda v: v['id']):
        if not (6000 <= u['id'] < 7000) or u['id'] in have:
            continue
        name = u['names']['en']
        bid = slug(name.replace('é', 'e'))
        rarity = u.get('rarity') if u.get('rarity') in ('rare', 'elite', 'legendary') else 'elite'
        new.append({'id': bid, 'gameId': u['id'], 'name': name, 'rarity': rarity, 'img': f'img/beasts/{bid}.webp',
                    'maxBuff': 18 if rarity == 'legendary' else 12, 'skill': None, 'roles': [], 'suits': None,
                    'tiers': {}, 'raw': {}, 'bestFor': [], 'needsReview': True})
    for b in new:
        print(f"new beast: {b['name']} ({b['rarity']}, game id {b['gameId']})")
    if not new or not write:
        return
    from PIL import Image
    for b in new:
        try:
            raw = get(f"{CDN}unit_icon_by_id/{b['gameId']}_2x.webp")
            Image.open(io.BytesIO(raw)).convert('RGBA').resize((128, 128), Image.LANCZOS).save(ROOT / b['img'], 'WEBP', quality=84, method=6)
        except Exception as e:
            print(f"  no portrait for {b['name']}: {e}")
    doc['beasts'] += new
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(f'added {len(new)} beasts. Research their skill and ratings, then remove needsReview.')


if __name__ == '__main__':
    main()
    sync_beasts(json.loads(get(CDN + 'unit.json')), '--write' in sys.argv)
