## Ce schimbă acest PR
<!-- Un singur flux (A-E din docs/TEAM.md). Dacă atingi fișierul altui flux, spune-o aici. -->

## Cum am verificat
- [ ] `npm run check` (tsc + vitest) trecut. Lipește ieșirea reală:
- [ ] Testat pe dispozitiv / în Airplane Mode (dacă e relevant):

## Reguli
- [ ] Niciun secret, cheie sau fișier `*PRIVATE*` în PR
- [ ] Niciun contract înghețat modificat (`PassengerContext`, `TrackingResult`, `LlmEngine`, `ToolDeps`) — sau există acord scris în PR
- [ ] Nicio cifră de benchmark/evaluare inventată; date neverificate au `verifiedOn: null`
