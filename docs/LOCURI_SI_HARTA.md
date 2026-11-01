# „Unde e…?” — catalogul de locuri și harta LiDAR

Întrebările „unde e toaleta / unde găsesc bancomatul / unde se află barul lui Coco / cum ajung la poarta 3” sunt rezolvate **fără model și fără fine-tuning**, în `src/tools/loop.ts` (după verificarea de urgență, înainte de calea rapidă).

## Piesele

| Fișier | Rol |
|---|---|
| `src/data/places.json` | catalogul: id, nume RO/EN, aliasuri (fără diacritice), `nodeId` (nodul hărții interioare), `where` (text; `null` dacă poziția nu e cunoscută) |
| `src/core/places.ts` | `findPlaces(întrebare)` (potrivește „unde …” + un loc; poartă după număr, ghișeu după număr), `composePlaceAnswer(...)` (variante deterministe, fără poziții inventate), `registerPlaces(...)` (plugin) |
| `src/app/navRef.ts` | `openMapFor(destinație, nodeId?)`: deschide harta pe nodul cunoscut, altfel potrivește textul |

## Reguli
- Un loc fără `where` primește răspunsul „e în terminal, poziția exactă apare pe hartă când e conectată”; nu inventăm etaje sau direcții.
- „Am deschis harta” se spune doar dacă harta chiar s-a deschis (`openAirportMap` întoarce `true`).
- Cel mai specific alias câștigă (un loc „numit”, ex. barul lui Coco, are bonus); la egalitate se listează maximum 3 locuri.

## Conectarea hărții LiDAR
Când harta reală există, ea cheamă o singură dată:

```ts
import { registerPlaces } from '../core/places';
registerPlaces([
  { id: 'atm', kind: 'atm', names: { ro: 'Bancomat (ATM)', en: 'ATM' }, aliases: ['atm', 'bancomat'], nodeId: 'f0_atm', where: { ro: 'La parter, lângă intrare', en: 'Ground floor by the entrance' } },
]);
```

Locurile înregistrate **înlocuiesc** pe cele cu același `id` și le completează pe celelalte; codul asistentului nu se schimbă. Testele: `tests/places.test.ts`.
