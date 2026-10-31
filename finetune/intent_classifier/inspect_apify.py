import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
path = r'<cale-locala>'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print('Total rows:', len(data))
print('Keys:', list(data[0].keys()))

origins = {}
langs = {}
for d in data:
    orig = d.get('origin', 'none')
    l = d.get('lang', 'none')
    origins[orig] = origins.get(orig, 0) + 1
    langs[l] = langs.get(l, 0) + 1

print('Origins:', origins)
print('Langs:', langs)

print('\nFirst 10 items:')
for i in range(min(10, len(data))):
    item = data[i]
    q = item.get('question', '')
    exp = item.get('expectedAny', [])
    lang = item.get('lang', '')
    orig = item.get('origin', '')
    print(f"{i+1}. [{lang} | {orig}] {q} -> {exp}")
