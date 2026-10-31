# Direcția UI: „Cloud Glass" pentru tabul Asistent

Referința: captura cu Flo, cardul de zbor, balonul de salut, sugestiile cu pictograme, câmpul de scris în degrade și bara de jos plutitoare. Cuvinte-cheie: Apple, liquid glass, glassmorphism, blur, Arc Browser, pastel, cloudy.

## Ce copiem și ce nu
| Din referință | Facem |
|---|---|
| Fundal de cer pastel cu nori și lumină de dimineață | Gradient lila → albastru → piersică, plus nori desenați în SVG, care plutesc încet (avem deja `DriftBackground`) |
| Sticlă cu blur real, margine luminoasă de 1 px, umbră moale | `expo-blur` (`BlurView`) pe iOS, cu fundal translucid peste. Fără `reduceTransparency`: suprafețe opace |
| Card de zbor mare sus: cod, rută, status „La timp", „84 min până la îmbarcare" | Card nou, cu datele din `flight` și `ticket` (nu din model); se micșorează la o bandă îngustă când conversația crește |
| Trei dale: Loc, Poartă, Îmbarcare | Aceleași trei, cu etichete „neconfirmată"/„estimată" când e cazul |
| Balon de salut cu avatar mic și oră | Avatar mic lângă fiecare răspuns al lui Flo, plus ora sub balon |
| Sugestii cu pictograme, lila | Chip-uri de sticlă lila, pictogramă diferită pe intenție (loc, ceas, poartă, hartă) |
| Câmp de scris în degrade periwinkle | Pastilă cu degrade `#8C9BFF → #A98BFF`, buton de trimitere rotund |
| Bară de jos plutitoare, pilulă de sticlă | Etapa 4, opțională (atinge toate ecranele) |
| Logo Wizz Air, fotografia cu aripa | **Nu.** Logo-ul e al unei mărci, fotografia are licență necunoscută. Folosim un insignă neutră cu codul companiei și o aripă/nori desenate de noi |

## Paleta (de adăugat în `src/theme/tokens.ts`, fără a o înlocui)
- Cer: `#EAF0FF` (sus), `#E6E2FF` (mijloc), `#FFE9DD` (jos, lumină caldă)
- Accent: `#6F7DFF` → `#A58BFF` (degrade), text pe accent alb
- Text: `#0B1430` (existent, contrast bun pe pastel)
- Sticlă: alb 55–70%, margine albă 80%, umbră `#1E3278` la 12%
- Status: verde `#0E9F6E` pe fundal `#DDF5EC` (existent)

## Etape
1. **Fundal și sticlă (0,5–1 h):** tokeni noi, nori SVG, `Glass` cu `BlurView`; text verificat pe contrast ≥ 4,5:1.
2. **Cardul de zbor (1 h):** componentă `FlightHero` cu countdown, dale și starea compactă la scroll.
3. **Baloane, chip-uri, câmp de scris (1 h):** avatar mic, ora, pictograme, degrade.
4. **Bara de jos plutitoare (opțional, 1 h):** modifică navigarea pentru toate ecranele, deci doar dacă mai e timp.

Fiecare etapă cere un build pe Mac (6–8 minute) pentru verificare pe telefon. `expo-blur` e modul nativ nou, deci prima etapă cere rebuild complet.

## Riscuri
- **Performanța blur-ului** pe telefoane mai vechi; de aceea `reduceTransparency` rămâne un comutator real.
- **Contrast** pe fundal pastel: textul rămâne navy, nu gri deschis.
- **Spațiu pe ecran:** cardul mare ia ~40% din înălțime; fără starea compactă, conversația rămâne fără loc.
- **Fotografii și logo-uri:** nicio imagine fără licență clară în repo.
