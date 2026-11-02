# Builds games/dnd/sheets/player-dev/extra-spells.json: official non-SRD spells from dnd5e.wikidot.com, stats only (no spell text).
# Usage: save https://dnd5e.wikidot.com/spells as <dir>/spells.html and https://www.dnd5eapi.co/api/2014/spells as <dir>/srd.json,
#        then: py -I build_extra_spells.py <dir> games/dnd/sheets/player-dev/extra-spells.json
import html, json, re, sys, time, urllib.request
wd, out = sys.argv[1], sys.argv[2]
page = open(wd + '/spells.html', encoding='utf-8').read()
key = lambda n: re.sub(r'[^a-z]', '', n.lower())
srd = {key(s['name']) for s in json.load(open(wd + '/srd.json'))['results']}
# the SRD drops the wizard's name from these PHB spells
alias = {"Bigby's Hand": 'Arcane Hand', "Nystul's Magic Aura": "Arcanist's Magic Aura", "Mordenkainen's Sword": 'Arcane Sword'}
named = lambda n: alias.get(n) or (re.sub(r"^\w+'s ", '', n) if n != "Jim's Magic Missile" else n)
tabs = re.split(r'<div id="wiki-tab-0-(\d)"', page)
rows = []
for i in range(1, len(tabs), 2):
    lvl = int(tabs[i])
    for tr in re.findall(r'<tr>(.*?)</tr>', tabs[i + 1], re.S):
        td = re.findall(r'<td>(.*?)</td>', tr, re.S)
        if len(td) < 6: continue
        m = re.search(r'href="/spell:([^"]+)">([^<]+)<', td[0])
        slug, name = m.group(1), html.unescape(m.group(2)).strip()
        if '(' in name or key(named(name)) in srd or key(name) in srd: continue  # skip UA/homebrew and SRD
        txt = lambda s: html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
        dur = txt(td[4])
        rows.append({'index': slug, 'name': name, 'level': lvl, 'school': txt(td[1]),
                     'casting_time': txt(td[2]).replace(' R', '').strip(), 'ritual': '<sup>R</sup>' in td[2],
                     'range': txt(td[3]), 'duration': re.sub(r'^Concentration, u', 'U', dur),
                     'concentration': dur.startswith('Concentration'), 'components': [c.strip() for c in txt(td[5]).split(',')]})
for r in rows:
    req = urllib.request.Request('https://dnd5e.wikidot.com/spell:' + r['index'], headers={'User-Agent': 'Mozilla/5.0'})
    p = urllib.request.urlopen(req, timeout=20).read().decode('utf-8')
    m = re.search(r'<strong>Components:</strong>\s*([^<]*)', p)
    mat = re.search(r'\bM \((.*)\)\s*$', html.unescape(m.group(1)).strip()) if m else None
    if mat: r['material'] = mat.group(1)
    s = re.search(r'<p>Source: ([^<]*)</p>', p)
    r['source'] = html.unescape(s.group(1)).strip() if s else ''
    time.sleep(0.3)
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'spells')
