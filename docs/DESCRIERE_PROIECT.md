# Descriere pentru încărcarea proiectului (text de lipit în formular)

## Versiune scurtă (~120 de cuvinte)

FlyQ este un asistent de aeroport care rulează **complet offline pe iPhone**, pentru Aeroportul Internațional Craiova. Pasagerul întreabă în limbaj natural, cu greșeli și argou („am voie cu lichide?", „ce poartă am?", „la ce oră decolăm?"), iar un model de limbaj mic, RoLlama 3.2 1B, rulează direct pe telefon și alege unealta potrivită. Faptele despre zbor și regulile de călătorie vin din cod determinist și dintr-o bază de cunoștințe locală; modelul nu scrie fapte și nu poate inventa ore, porți sau reguli. Aplicația are un client pentru serverul FlyQ (zboruri, ETA), iar un modul de hartă interactivă din scanare LiDAR, realizat de Denis, urmează să fie integrat pentru ghidarea pasagerului către punctele de interes. Proiectul se compilează din repo-ul public, cu pași și timpi documentați.

## Versiune lungă

**Problema.** Într-un aeroport, pasagerul are întrebări simple (poartă, oră, bagaj, lichide, unde e toaleta) și, adesea, rețea slabă sau costisitoare. Soluțiile bazate pe server nu merg offline, iar un chatbot liber poate inventa informații despre zbor.

**Soluția.** Un asistent care rulează pe telefon și separă clar două lucruri: *înțelegerea* întrebării (modelul) și *faptele* (codul). Modelul primește întrebarea și răspunde cu o singură alegere, o unealtă dintr-o listă de șapte, în format JSON. Unealta calculează răspunsul din date verificate, iar propoziția finală este construită din rezultat, cu avertismentele cuvenite („după orar", „estimare a furnizorului"). Așa, asistentul nu poate afirma o oră sau o poartă care nu există în date.

**Cum funcționează.** Întrebarea trece printr-un normalizator (repară tastarea grăbită, păstrează numerele de zbor), printr-o limită de capabilități (refuză cumpărări, rezervări, cultură generală), printr-o cale rapidă pentru întrebările evidente și apoi prin routerul RoLlama, cu decodare constrânsă. Un sanitizer extrage numărul zborului din textul pasagerului, nu din model. Urgențele primesc un răspuns fix cu 112.

**Componentele echipei**
- *Aplicația iOS* (Expo / React Native): călătorie, zbor, hartă, asistent, profil, în designul Liquid Glass & Sky.
- *Modulul AI:* RoLlama 3.2 1B cu fine-tuning SFT + DPO, cuantizat Q4_0 (~812 MB), rulat cu llama.cpp prin llama.rn.
- *Backend FlyQ:* sesiuni, zboruri de la Craiova, ETA, conținut, notificări push.
- *Modulul hărții interactive (Denis):* hartă interioară din scanare LiDAR, cu puncte de interes și ghidare. În dezvoltare, neintegrat; punctul de integrare există (`open_airport_map` → `NavigationHandler.openAirportMap`).

**Ce este verificat și ce nu (cifre reale)**
- Modelul se încarcă și rulează pe iPhone 15: o măsurătoare a arătat ~30,7 tokeni/s și primul token în 0,1 s.
- Pe laptop (llama.cpp), pe 70 de întrebări stratificate, doar modelul: 69 JSON valide, 54 corecte (77,1%). Acuratețea pe telefon și în combinație cu regulile nu este încă măsurată.
- Regulile deterministe decid 61,1% dintre cele 1000 de întrebări de stres, toate corect; ele au fost scrise uitându-se la acest set, deci cifra nu se generalizează automat.
- Notificările iOS sunt scrise, dar dezactivate în build (cer un profil de semnare cu Push și configurarea serverului).
- Cifra de „98,2%" dintr-un benchmark Python nu se reproduce din repo și nu reprezintă acuratețea de pe telefon; nu o folosim.

**Reproducere.** Repo-ul public conține un script de verificare (`node scripts/verify.mjs`: typecheck, 675 de teste, benchmark determinist, ~8 s pe o clonă nouă), pașii de build iOS (5 min 25 s pentru un build incremental pe Mac mini M4) și scriptul care verifică modelul după mărime și SHA-256. Modelul (851 MB) nu e în repo și se obține de la echipă.

**Repo:** https://github.com/EduardAndreiNiculescu/flyq-rollama
