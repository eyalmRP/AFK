"""Adds heroes and beasts that are new in the game to data/, with portraits.

Reads the public unit database mirrored at github.com/floofpire/cdn (pulled from
Lilith's CDN), finds ascended-tier heroes that data/heroes.json does not have
yet, and stores their portraits in img/heroes/: the 400px icon scaled to 256px
WebP where the CDN has one, otherwise the 200px icon.
New entries get name, faction, type and game-data roles; their class, kit and
ratings still need research, so they are marked "needsReview": true.

Run with:  python3 scripts/sync_roster.py              (dry run, lists new heroes)
           python3 scripts/sync_roster.py --write      (adds them)
           python3 scripts/sync_roster.py --portraits  (re-downloads every hero portrait)
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


def save_portrait(game_id, dest):
    """Hero portrait: the 400px icon scaled to 256px, or the 200px icon when there is no 400px one."""
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(get(f"{CDN}unit_icon_by_id/{game_id}_4x.webp"))).convert('RGBA').resize((256, 256), Image.LANCZOS)
    except Exception:
        im = Image.open(io.BytesIO(get(f"{CDN}unit_icon_by_id/{game_id}_2x.webp"))).convert('RGBA')
    im.save(dest, 'WEBP', quality=80, method=6)


def refresh_portraits():
    doc = json.loads((ROOT / 'data' / 'heroes.json').read_text())
    for h in doc['heroes']:
        if not h.get('img') or not h.get('gameId'):
            continue
        try:
            save_portrait(h['gameId'], ROOT / h['img'])
        except Exception as e:
            print(f"  kept the old portrait for {h['name']}: {e}")
    print(f"refreshed {len(doc['heroes'])} portraits")


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
    # Heroes added by hand from patch notes before the game data had them
    # (no gameId yet): link them instead of adding a duplicate.
    by_hand = {slug(h['name']): h for h in doc['heroes'] if not h.get('gameId')}
    linked = []
    for u in units.values():
        # Heroes have ids below 1000; elite/legendary internal rarity = ascended tier.
        if u['id'] >= 1000 or u['id'] in have_game or u.get('rarity') not in ('elite', 'legendary'):
            continue
        name = u['names']['en']
        if slug(name) in by_hand:
            linked.append((by_hand.pop(slug(name)), u['id']))
            continue
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
    for h, gid in linked:
        print(f"link: {h['name']} (added by hand) is game id {gid}")
    for h in new:
        print(f"new: {h['name']} ({h['faction']}, game id {h['gameId']})")
    if not new and not linked:
        print('roster is up to date')
        return
    if not write:
        print('dry run: pass --write to add them')
        return
    for h, gid in linked:
        h['gameId'] = gid
        h['img'] = f"img/heroes/{h['id']}.webp"
        try:
            save_portrait(gid, ROOT / h['img'])
        except Exception as e:
            print(f"  no portrait for {h['name']}: {e}")
            h['img'] = None
    for h in new:
        try:
            save_portrait(h['gameId'], ROOT / h['img'])
        except Exception as e:  # keep the hero; the page falls back to initials
            print(f"  no portrait for {h['name']}: {e}")
            h['img'] = None
    doc['heroes'] = sorted(doc['heroes'] + new, key=lambda x: x['name'])
    doc['count'] = len(doc['heroes'])
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(f'added {len(new)} heroes. Set their class, release month, kit and ratings, then remove needsReview.')


def save_beast(im, dest):
    """Beast art comes as a portrait card (186x250): crop a square near the top,
    where the head is, instead of squashing the card into a square."""
    from PIL import Image
    im = im.convert('RGBA')
    w, h = im.size
    side = min(w, h)
    top = min(h - side, round(h * 0.056))
    left = (w - side) // 2
    im.crop((left, top, left + side, top + side)).resize((128, 128), Image.LANCZOS).save(dest, 'WEBP', quality=84, method=6)


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
            save_beast(Image.open(io.BytesIO(raw)), ROOT / b['img'])
        except Exception as e:
            print(f"  no portrait for {b['name']}: {e}")
    doc['beasts'] += new
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    print(f'added {len(new)} beasts. Research their skill and ratings, then remove needsReview.')


if __name__ == '__main__':
    if '--portraits' in sys.argv:
        refresh_portraits()
    else:
        main()
        sync_beasts(json.loads(get(CDN + 'unit.json')), '--write' in sys.argv)
