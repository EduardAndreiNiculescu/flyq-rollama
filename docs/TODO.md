# TODO (reluat mâine, 2026-11-02)

Demo: 1 noiembrie 2026. Reguli de lucru: fără build fără aprobare, fără push fără aprobare, nicio cheie în cod sau chat.

## A. De testat pe build-ul instalat azi-noapte
Build-ul include codul până la commit-ul cu căutarea live a biletului (scanner cu cameră, globul pe iOS, aeroporturi din toată lumea, „unde e…?”, pluralele din AI). **Nu include** sugestiile rotative din tabul AI, blocarea pașilor, pastila din header și înregistrarea push automată (sunt scrise, neconstruite).

- [ ] **Scanare:** apare dialogul de cameră; refuz → „Deschide Setările” + „Lipește codul”; fără scan fals / bilet de demo automat.
- [ ] **Bilet real scanat** (ex. W4 3773 CRA→BGY): zborul se găsește pe server, biletul păstrează numele/locul/PNR-ul de pe bilet; bilet pentru altă zi → „altă zi”.
- [ ] **Număr de zbor** `JAL115` (HND): nu mai apare „aeroport lipsă”. AFR188 încă 404 (întrebare la Mihai).
- [ ] **Glob în aer** pe cardul de zbor (are nevoie de internet; fără internet → harta desenată, după ~16 s). Pastilele pot fi suprapuse pe ecran îngust.
- [ ] **„Unde e…?”** (toaletă, ATM, bar Coco, poarta 3): răspuns + „Am deschis harta” doar dacă s-a deschis.
- [ ] **AI:** „Am voie cu câini?”, „Pot lua pisicile cu mine?”, „Când aterizăm?”, „Pe ce poartă sunt?”; caseta de diagnostic arată pe ce cale a mers.
- [ ] **Pagina de partajare:** buton „Trimite familiei” → link `https://flyq-share.netlify.app/s/<token>` se deschide; `/test` pe telefon.
- [ ] Notificări din backend (poartă / întârziere) ajung pe telefon și se vede bannerul din aplicație.

## B. Zbor anulat (Mihai a adăugat starea „anulat”)
- [ ] Ecran/stare „Zbor anulat”: cum arată în Zbor, în pastila de sus, în Călătorie (pașii se opresc), în Asistent (răspunsuri), pe cardul Live Activity și în notificare.
- [ ] Ce spune aplicația: drepturile pasagerului (rambursare / realocare / despăgubire, din baza de cunoștințe), fără să inventeze.
- [ ] Test cap-coadă: backend trimite „anulat” → telefonul primește push → bannerul + ecranul se schimbă (verificat pe telefonul tău).
- [ ] Pagina de partajare + `/test`: etapă „Anulat”.
- [ ] Întrebări pentru Mihai: ce câmpuri trimite la anulare (`status`, motiv, alternativă?), cum declanșăm demo-ul.

## C. Build următor (include tot ce e scris după build-ul de azi-noapte)
- [ ] Cheia aplicației în `~/.flyq-build-env` pe Mac (o singură dată, pusă de tine direct pe Mac).
- [ ] Verificat: înregistrarea push automată după adăugarea biletului, cardul Live Activity pornit singur, sugestiile rotative din AI, pașii blocați („De la HH:MM”), pastila „CRA → LTN” lizibilă.
- [ ] Mihai: abonare push după număr de zbor + dată (nu doar ID CRA), upsert pe token, mediu `production` la distribuire, token per instalare (opțional).

## D. Prezentare și livrabile
- [ ] **Aplicația de control a ecranelor** (de definit: ce controlează și pe ce dispozitiv; presupun o aplicație separată/pagină care comută etapele demo pe telefon și pe site).
- [ ] **Videoclip scurt de prezentare** (script + ce secvențe înregistrăm, în ce ordine).
- [ ] **Pitch complet** (structură, mesaje, demo live vs. înregistrat, plan B fără internet).
- [ ] **Harta 3D (Denis), ramura `feat/denis-map`** (vezi `docs/HARTA_3D_INTEGRARE.md`): primul build cu modulul nativ (`pod install` neverificat), memoriile `.flyqmap` (3 zone, ~96 MB) ca „Găsește-mă” să meargă, testat ghidul haptic mersul real, polish (etichete noi din filmări/poze, Self check-in pe hartă).

## E. Rămase, mai mici
- [ ] Globul din aplicație: pastilele sus/jos ca pe site.
- [ ] Cazurile din raportul lui Mihai: QR care nu e BCBP, loc nealocat, spații la începutul codului, bilete cu mai multe segmente.
- [ ] Lichide la Craiova: verificat dacă aeroportul are scannere CT (acum răspunsul spune „fără confirmare”).
- [ ] Slăbiciuni AI cunoscute: „sticlă de apă de 500 ml”, „întârziere 5 ore”, „am pierdut zborul”, lipsesc wifi / încărcare / schimb valutar în baza de cunoștințe.
- [ ] Push pe GitHub (repo public: scanare UDID / team ID / căi înainte) și închiderea PR #1 (unit local).
