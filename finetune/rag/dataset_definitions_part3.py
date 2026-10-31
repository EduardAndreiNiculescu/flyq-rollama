# Part 3: Children, Documents, Border, Medical, Boarding, Airport-Specific, and Emergency concepts

CONCEPTS_PART3 = [
    # ----------------------------------------------------
    # TOPIC 9: medical (3 pairs = 6 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "med_liquid_medications_syringes",
        "topic": "medical",
        "source_id": "EURLEX_AVSEC_2015_1998",
        "jurisdiction": ["EU", "RO"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Essential liquid medications and injection syringes needed during travel are exempt from the 100 ml limit.",
                "sourceSection": "Commission Implementing Regulation (EU) 2015/1998 Attachment 4-A",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998"
            }
        ],
        "keywords_ro": ["medicamente lichide", "insulina avion", "seringi diabet", "reteta medicala avion", "exceptie medicamente 100 ml", "trusa medicala cabina"],
        "keywords_en": ["liquid medication", "insulin flight", "diabetes syringes", "doctor prescription plane", "medication exemption 100 ml", "medical kit cabin"],
        "ro": {
            "title": "Medicamente lichide și seringi medicale: exceptate de la limita de 100 ml",
            "text": "Medicamentele lichide, siropurile, picăturile pentru ochi, fiolele injectabile și seringile hipodermice (cum ar fi acele și stilourile injector de insulină pentru diabetici) necesare pe durata călătoriei sunt exceptate legal de la restricția de 100 de mililitri și nu trebuie să încapă în punga transparentă resigilabilă de 1 litru. Pasagerul are voie să transporte în bagajul de mână cantitatea de tratament medical necesară pentru întreaga durată a zborului, inclusiv pentru posibile întârzieri sau escale neplanificate. La punctul de control de securitate, aceste medicamente și dispozitive medicale trebuie declarate și prezentate separat ofițerilor de securitate. Este ferm recomandat ca pasagerul să aibă asupra sa o scrisoare medicală recentă sau o rețetă medicală în limba engleză (sau română) eliberată de medicul curant, care să ateste necesitatea tratamentului și să corespundă cu numele de pe cartea de îmbarcare.",
            "questions": [
                "Pot lua insulină și seringi în bagajul de mână în avion?",
                "am voie cu siropuri si picaturi de ochi peste 100 ml la securitate",
                "trebuie reteta medicala pentru medicamentele din avion?",
                "se confisca medicamentele lichide la controlul de securitate",
                "ce acte trebuie sa arat la aeroport daca am tratament medical injectabil"
            ]
        },
        "en": {
            "title": "Liquid medications and medical syringes: legal exemption from the 100 ml threshold",
            "text": "Essential liquid medications, syrups, eye drops, injectable ampoules, and hypodermic needles (such as insulin pens used by diabetic travellers) required during the trip are legally exempt from the 100 millilitre volume restriction and are not required to fit inside the standard 1-litre resealable plastic bag. Passengers are authorized to pack in their cabin baggage the necessary quantity of medical treatments required for the flight duration, including potential flight delays or unexpected layovers. At the airport security screening checkpoint, all medical liquids and syringes must be declared and presented separately from ordinary hand luggage. It is strongly advised that the passenger carry an official medical letter or prescription signed by their attending physician (preferably in English), verifying the medical necessity of the supplies and matching the name printed on the passenger's boarding pass.",
            "questions": [
                "Can I carry insulin pens and injection needles in my carry-on bag?",
                "are liquid medicines over 100 ml allowed through airport security",
                "do I need a doctor's prescription to fly with prescription medication?",
                "will security officers confiscate prescription liquids in the cabin",
                "what medical documentation is required to travel with injectable medicine"
            ]
        }
    },
    {
        "concept_id": "med_devices_cpap_poc",
        "topic": "medical",
        "source_id": "EURLEX_1107_2006",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Medical assistive equipment (CPAP, POC) is carried free of charge in addition to standard luggage upon 48-hour prior notification.",
                "sourceSection": "Regulation (EC) No 1107/2006 Annex II and IATA Medical Manual",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1107"
            }
        ],
        "keywords_ro": ["aparat cpap avion", "concentrator oxigen portabil", "echipament medical gratuit", "baterii litiu cpap", "bagaj medical suplimentar", "apnee somn"],
        "keywords_en": ["cpap machine flight", "portable oxygen concentrator", "free medical baggage", "cpap lithium battery", "additional medical bag", "sleep apnea"],
        "ro": {
            "title": "Aparate medicale respiratorii (CPAP și POC): transport gratuit în cabină",
            "text": "Aparatele medicale esențiale pentru asistență respiratorie, cum ar fi dispozitivele CPAP pentru apnee în somn și concentratoarele portabile de oxigen (POC - Portable Oxygen Concentrators), sunt transportate gratuit în cabina aeronavei, ca bagaj medical suplimentar care nu se scade din norma standard de bagaj de mână inclusă în bilet. Pentru a asigura acceptarea la bord, pasagerul trebuie să contacteze departamentul de asistență medicală al companiei aeriene cu cel puțin 48 de ore înainte de zbor, furnizând modelul exact al aparatului și certificarea acestuia (aprobat FAA sau EASA pentru utilizare la bord). Dacă dispozitivul funcționează cu baterii litiu-ion autonome, acestea trebuie să respecte limitele IATA DGR privind capacitatea în Watt-oră, iar pasagerul trebuie să aibă o autonomie a bateriilor de cel puțin 150% din durata zborului dacă intenționează să utilizeze aparatul în timpul zborului.",
            "questions": [
                "Pot lua aparatul de apnee CPAP în avion ca bagaj suplimentar gratuit?",
                "trebuie sa anunt compania daca zbor cu concentrator de oxigen portabil",
                "se taxeaza transportul aparatelor medicale in cabina avionului?",
                "ce reguli sunt pentru bateriile aparatului CPAP la bordul avionului",
                "pot folosi aparatul de oxigen in timpul zborului"
            ]
        },
        "en": {
            "title": "Respiratory medical devices (CPAP and POC machines): complimentary cabin carriage",
            "text": "Life-supporting respiratory medical devices, such as Continuous Positive Airway Pressure (CPAP) machines for sleep apnea and approved Portable Oxygen Concentrators (POC), are transported free of charge in the passenger cabin as authorized medical equipment, without counting against standard cabin baggage allowances. To ensure smooth acceptance at check-in and boarding, the passenger must contact the airline's special assistance desk at least 48 hours prior to departure, providing the exact make, model, and FAA/EASA airworthiness certification details. If the equipment is powered by rechargeable lithium-ion batteries, they must adhere to standard dangerous goods safety limits, and passengers planning to operate the equipment during the flight must carry sufficient battery capacity to cover at least 150% of the scheduled flight duration to accommodate air traffic holding delays.",
            "questions": [
                "Can I bring my sleep apnea CPAP machine on a flight as free medical baggage?",
                "do I have to notify the airline before flying with a portable oxygen concentrator?",
                "do airlines charge extra fees to carry medical equipment in the cabin",
                "what are the battery requirements for using a CPAP machine during a flight",
                "is an FAA approved label required on medical oxygen concentrators"
            ]
        }
    },
    {
        "concept_id": "med_flying_pregnant_limits",
        "topic": "medical",
        "source_id": "YOUR_EUROPE_AIR_RIGHTS",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Air travel allowed without restrictions up to 28th week; medical certificate required between 28 and 36 weeks; prohibited after 36 weeks.",
                "sourceSection": "IATA Medical Guidance for Passenger Health & Airline Carriage Rules",
                "sourceUrl": "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm"
            }
        ],
        "keywords_ro": ["zbor femei insarcinate", "saptamana 28 sarcina", "adeverinta medicala sarcina", "saptamana 36 interzis zbor", "fit to fly sarcina", "sarcina multipla"],
        "keywords_en": ["flying pregnant", "28 weeks pregnancy", "doctor fit to fly pregnancy", "36 weeks flight prohibited", "airline pregnancy certificate", "multiple pregnancy flight"],
        "ro": {
            "title": "Călătoria cu avionul în timpul sarcinii: limite pe săptămâni și aviz medical",
            "text": "Regulile medicale de transport aerian aplicate de majoritatea companiilor aeriene stabilesc restricții precise privind stadiul sarcinii pentru a preveni riscul de naștere prematură la bord. Până la sfârșitul celei de-a 28-a săptămâni de sarcină fără complicații, femeile însărcinate pot zbura de regulă fără a fi necesar vreun certificat medical special. Începând cu a 28-a săptămână și până la sfârșitul celei de-a 36-a săptămâni de sarcină simplă (sau până la a 32-a săptămână în cazul unei sarcini gemelare ori multiple), compania aeriană solicită obligatoriu o adeverință medicală recentă (certificat „Fit to Fly”) semnată de medicul ginecolog, emisă cu maximum 7-14 zile înainte de zbor, care să ateste că sarcina decurge normal și data estimată a nașterii. După împlinirea a 36 de săptămâni (sau 32 de săptămâni pentru gemeni), companiile aeriene interzic categoric îmbarcarea pasagerelor însărcinate din motive stricte de siguranță medicală.",
            "questions": [
                "Până la câte săptămâni de sarcină pot zbura cu avionul?",
                "trebuie adeverinta de la medic ginecolog daca sunt insarcinata si zbor",
                "ce este certificatul fit to fly pentru femei gravide la avion",
                "pot zbura daca sunt insarcinata in 34 de saptamani cu gemeni?",
                "de ce interzic companiile aeriene zborul gravidelor dupa saptamana 36"
            ]
        },
        "en": {
            "title": "Air travel during pregnancy: gestational week thresholds and medical clearance",
            "text": "Aviation medical guidelines adopted by commercial airlines enforce precise gestational thresholds to minimize the risk of unexpected in-flight labor. Up to the completion of the 28th week of an uncomplicated pregnancy, expectant mothers are generally permitted to travel without specialized medical clearance. Between the start of the 28th week and the end of the 36th week of a single pregnancy (or up to the 32nd week for multiple pregnancies such as twins), airlines strictly mandate an official medical clearance letter ('Fit to Fly' certificate) signed by an obstetrician. This certificate must be issued within 7 to 14 days of departure, validating that the pregnancy is progressing without complications and specifying the estimated due date. Beyond the 36th week (or 32nd week for multiple gestations), commercial airlines unconditionally bar pregnant travellers from boarding due to the absence of emergency obstetric facilities in flight.",
            "questions": [
                "Up to how many weeks of pregnancy can a woman fly on a commercial plane?",
                "is a doctor's fit to fly note required for pregnant air travellers?",
                "what are the airline rules for flying while pregnant with twins",
                "can I board a flight if I am 35 weeks pregnant",
                "why do airlines ban flying after the 36th week of pregnancy"
            ]
        }
    },

    # ----------------------------------------------------
    # TOPIC 10: boarding (3 pairs = 6 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "brd_checkin_bagdrop_deadlines",
        "topic": "boarding",
        "source_id": "YOUR_EUROPE_AIR_RIGHTS",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Check-in and bag drop counters open 2 hours before departure and strictly close 40 to 45 minutes before scheduled takeoff.",
                "sourceSection": "Your Europe Air FAQ & Standard Airline Carriage Terms",
                "sourceUrl": "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/faq/index_en.htm"
            }
        ],
        "keywords_ro": ["inchidere checkin", "predare bagaje cala", "bag drop 40 minute", "deschidere ghisee 2 ore", "pierdut bilet intarziat ghiseu"],
        "keywords_en": ["check-in closing", "bag drop deadline", "bag drop 40 minutes", "counters open 2 hours", "missed flight late checkin"],
        "ro": {
            "title": "Ghișeele de check-in și predare bagaje (Bag Drop): orare și închidere strictă",
            "text": "Ghișeele fizice de check-in și de predare a bagajelor de cală (Bag Drop) din aeroport se deschid de regulă cu 2 ore înainte de ora decolării programate (sau cu 3 ore pentru zborurile intercontinentale de lung-curier). Închiderea ghișeelor este automată și extrem de strictă: pe majoritatea aeroporturilor europene, ghișeele se blochează cu exact 40 sau 45 de minute înainte de ora de plecare publicată. Pasagerii care se prezintă la ghișeu după acest termen limită nu își mai pot preda bagajele de cală și nu mai pot fi înregistrați pe zbor. Sistemul informatic al companiei refuză emiterea tichetelor de îmbarcare după expirarea termenului, iar pasagerul este considerat „neprezentat la timp” (no-show), pierzând biletul de avion fără dreptul de a solicita despăgubiri, reprogramare gratuită sau asistență pentru întârziere.",
            "questions": [
                "Cu câte minute înainte de zbor se închid ghișeele de check-in și bagaje?",
                "cand se deschid ghiseele de bag drop la aeroport",
                "pot lasa bagajul de cala cu 30 de minute inainte de decolare?",
                "ce se intampla daca ajung la ghiseu dupa ce s-a inchis checkinul",
                "de ce se blocheaza predarea bagajelor cu 45 de minute inainte de plecare"
            ]
        },
        "en": {
            "title": "Check-in and bag drop desks: opening hours and strict closing deadlines",
            "text": "Physical airport check-in and hold luggage drop-off counters (Bag Drop) typically open 2 hours prior to scheduled departure (3 hours for intercontinental long-haul flights). Desk closure is automated and uncompromisingly enforced: across European airports, counters officially lock exactly 40 to 45 minutes before published departure time. Passengers arriving at the desk after this strict deadline cannot check their luggage into the hold or complete departure registration. Airline automated reservation systems automatically terminate check-in processing upon reaching the deadline, classifying late passengers as 'no-shows.' Under European air transport law, passengers arriving after published check-in cut-off times forfeit their flights without any legal entitlement to statutory delay compensation, free flight rebooking, or hotel accommodation.",
            "questions": [
                "How many minutes before departure do airport check-in desks close?",
                "when does the luggage bag drop desk open at the airport",
                "can I drop my checked suitcase 30 minutes before takeoff?",
                "what happens if I arrive at check-in after the desk has closed",
                "why do airlines enforce a strict 45-minute cut-off for checked bags"
            ]
        }
    },
    {
        "concept_id": "brd_gate_closure_final_call",
        "topic": "boarding",
        "source_id": "YOUR_EUROPE_AIR_RIGHTS",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Boarding gates strictly close 15 to 20 minutes before departure; no passenger is boarded after final call closure.",
                "sourceSection": "Your Europe Air FAQ & Airline Flight Operations",
                "sourceUrl": "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/faq/index_en.htm"
            }
        ],
        "keywords_ro": ["inchidere poarta imbarcare", "ultimul apel", "final call", "15 minute inainte decolare", "poarta blocata avion"],
        "keywords_en": ["gate closure deadline", "final call boarding", "last call", "15 minutes before departure", "gate locked boarding"],
        "ro": {
            "title": "Închiderea porții de îmbarcare și Ultimul Apel (Final Call): regula celor 15 minute",
            "text": "Poarta de îmbarcare (gate) se deschide de obicei cu 30-40 de minute înainte de zbor și se închide strict cu 15 sau 20 de minute înainte de ora de plecare prevăzută pe bilet. Afișarea mesajului „Ultimul apel” (Final Call) pe monitoarele din aeroport reprezintă ultimul avertisment că operațiunea de scanare a cărților de îmbarcare este aproape finalizată și că accesul în avion se blochează definitiv în câteva minute. Odată ce poarta a fost închisă oficial de către agenții de sol, sistemul de îmbarcare este deconectat pentru a permite calculul masei și centrajului aeronavei și închiderea ușilor. Niciunui pasager nu i se mai permite accesul la bord după acest moment, chiar dacă avionul este încă staționat pe platformă sau vizibil prin ferestre. Sosirea târzie la poartă atrage anularea automată a călătoriei din vina pasagerului.",
            "questions": [
                "Cu câte minute înainte de decolare se închide poarta de îmbarcare?",
                "ce inseamna mesajul final call sau ultimul apel pe ecranele din aeroport",
                "mai pot urca in avion daca poarta s-a inchis dar avionul e inca acolo?",
                "de ce se inchide poarta cu 15 minute inainte de ora zborului",
                "ce se intampla daca ratez imbarcarea la poarta desi am trecut de securitate"
            ]
        },
        "en": {
            "title": "Boarding gate closure and Final Call warnings: the strict 15-minute rule",
            "text": "The aircraft boarding gate typically opens 30 to 40 minutes prior to scheduled departure and strictly closes 15 to 20 minutes before the flight's published takeoff time. The appearance of the 'Final Call' or 'Gate Closing' alert on airport flight information display screens is the definitive warning that passenger processing is terminating and the jet bridge or boarding stairs will be withdrawn within minutes. Once ground staff officially close the gate, the departure control manifest is locked to allow flight crew to finalize weight-and-balance calculations and seal aircraft doors. Under no circumstances will ground agents reopen a closed gate, even if the aircraft remains visibly parked at the stand. Arriving at the gate after the published cut-off time constitutes a passenger-fault no-show, forfeiting the ticket.",
            "questions": [
                "How many minutes before takeoff does the boarding gate close?",
                "what does the Final Call alert mean on airport flight screens",
                "can gate agents let me board if the plane is still parked outside?",
                "why do airlines lock the boarding gate 15 minutes before flight time",
                "what happens if I miss boarding at the gate after passing security"
            ]
        }
    },
    {
        "concept_id": "brd_boarding_pass_formats",
        "topic": "boarding",
        "source_id": "YOUR_EUROPE_AIR_RIGHTS",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Boarding passes must be original printed paper or displayed via official airline apps / Apple and Google Wallet; simple screenshots may fail scanners.",
                "sourceSection": "IATA Bar Coded Boarding Pass (BCBP) Standard",
                "sourceUrl": "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm"
            }
        ],
        "keywords_ro": ["carte de imbarcare telefon", "apple wallet bilet", "google wallet boarding pass", "printare carte imbarcare", "scaner cod bare aeroport"],
        "keywords_en": ["mobile boarding pass", "apple wallet ticket", "google wallet boarding pass", "print boarding pass", "barcode scanner airport"],
        "ro": {
            "title": "Formate acceptate pentru cartea de îmbarcare: aplicație mobilă, Wallet sau printat",
            "text": "Cartea de îmbarcare (Boarding Pass) este documentul indispensabil care conține codul de bare 2D standardizat IATA (BCBP), necesar pentru a deschide porțile electronice de acces la securitate și pentru scanarea finală la poarta de îmbarcare. Companiile aeriene și aeroporturile europene acceptă cartea de îmbarcare în două formate principale: format tipărit pe hârtie A4 clară sau format digital afișat pe ecranul smartphone-ului. Pentru formatul digital, se recomandă utilizarea aplicației oficiale a companiei aeriene sau salvarea biletului în portofelul electronic Apple Wallet ori Google Wallet, care optimizează automat luminozitatea ecranului și contrastul codului de bare. O simplă captură de ecran (screenshot) sau o poză descărcată poate cauza erori de reflexie pe cititoarele optice automate de la turnicheți, riscând blocarea pasagerului în fluxul de control.",
            "questions": [
                "Trebuie neapărat să printez cartea de îmbarcare sau o pot arăta pe telefon?",
                "se accepta biletul de avion salvat in Apple Wallet sau Google Wallet",
                "ce fac daca se blocheaza scanerul de coduri de bare la aeroport cu telefonul?",
                "pot folosi o captura de ecran cu biletul de avion la poarta",
                "unde se scaneaza cartea de imbarcare in aeroport"
            ]
        },
        "en": {
            "title": "Accepted boarding pass formats: official mobile apps, digital Wallets, or printed paper",
            "text": "The boarding pass is an indispensable travel credential encoding the standardized IATA 2D barcode (BCBP), mandatory for accessing automatic security gates and clearing the aircraft boarding portal. European airports accept boarding passes in two primary mediums: physical paper tickets printed clearly on clean paper, or digital electronic passes rendered on a smartphone screen. For digital passes, travellers should open the official mobile app of the airline or add the pass directly to Apple Wallet or Google Wallet, which automatically optimizes screen brightness and contrast for optical barcode scanners. Relying on compressed smartphone screenshots or low-resolution image downloads frequently triggers barcode scanning failures at automated security turnstiles, resulting in avoidable delays and manual verification queues.",
            "questions": [
                "Do I need to print my boarding pass or can I show it on my smartphone?",
                "are boarding passes in Apple Wallet or Google Wallet accepted at EU airports",
                "what happens if the barcode scanner fails to read my mobile boarding pass?",
                "can I use a screenshot of my boarding pass to board an airplane",
                "where is the boarding pass barcode scanned inside the airport"
            ]
        }
    },

    # ----------------------------------------------------
    # TOPIC 11: airport_specific (3 pairs = 6 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "apt_cra_security_electronics_out",
        "topic": "airport_specific",
        "source_id": "AEROPORT_CRAIOVA_SECURITY",
        "jurisdiction": ["RO"],
        "airportCodes": ["CRA"],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "At Craiova Airport (CRA), passengers must remove laptops, large electronics and liquid bags from hand luggage into separate trays.",
                "sourceSection": "Aeroportul Craiova - Controlul de securitate reglementari",
                "sourceUrl": "https://aeroportcraiova.ro/controlul-de-securitate/"
            }
        ],
        "keywords_ro": ["aeroportul craiova", "control securitate craiova", "laptop scos tava", "tablete scaner craiova", "tavite securitate craiova", "reguli cra"],
        "keywords_en": ["craiova airport", "craiova security check", "laptop out of bag", "electronics tray craiova", "screening trays craiova", "cra airport rules"],
        "ro": {
            "title": "Aeroportul Craiova (CRA): procedura de scanare a echipamentelor electronice",
            "text": "La punctul de control de securitate al Aeroportului Internațional Craiova (cod IATA: CRA), echipamentele tehnologice de scanare existente impun o procedură riguroasă de pregătire a bagajelor de mână. Înainte de a trece prin poarta detectoare de metale, toți pasagerii au obligația legală de a scoate complet din bagajele de cabină computerele portabile (laptopuri), tabletele electronice, cititoarele de cărți electronice și orice dispozitive electronice de mari dimensiuni, așezându-le individual în tăvi separate de plastic pentru scanarea cu raze X. De asemenea, punga transparentă de 1 litru care conține recipientele cu lichide de maxim 100 ml trebuie scoasă și așezată vizibil într-o tavă separată. Gecile groase, paltoanele, sacourile, curelele metalice și obiectele metalice din buzunare (chei, monede, telefoane mobile) se depun de asemenea în tăvi pentru inspecție.",
            "questions": [
                "Trebuie să scot laptopul din rucsac la controlul de securitate pe aeroportul din Craiova?",
                "care este procedura de control la Aeroportul International Craiova",
                "cum se pun electronicele in tavi la securitate la Craiova CRA?",
                "trebuie scoasa cureaua si geaca la filtrul de securitate din Craiova",
                "unde se aseaza punga cu lichide la controlul de securitate la aeroportul craiova"
            ]
        },
        "en": {
            "title": "Craiova Airport (CRA): security screening procedures for electronic devices",
            "text": "At the passenger security screening checkpoint of Craiova International Airport (IATA code: CRA), operational security protocols require passengers to prepare their cabin baggage rigorously prior to screening. Before passing through the walk-through metal detector portal, all departing passengers must completely unpack and remove portable computers (laptops), tablet computers, e-readers, and any large electronic devices from their carry-on bags, placing each device flat inside separate plastic trays for X-ray examination. The authorized 1-litre transparent plastic bag containing compliant liquids (maximum 100 ml per receptacle) must also be placed separately in a tray. Heavy outer jackets, winter coats, belts with metal buckles, and pocket items (such as metallic keys, loose coins, and smartphones) must likewise be deposited in screening trays for independent inspection.",
            "questions": [
                "Do I need to take my laptop out of my bag at Craiova Airport security?",
                "what is the security screening procedure at Craiova International Airport CRA",
                "how should electronic devices be placed in trays at Craiova Airport?",
                "do I have to take off my belt and jacket at Craiova airport screening",
                "where do liquid bags go during security checks at Craiova Airport"
            ]
        }
    },
    {
        "concept_id": "apt_cra_arrival_timeline",
        "topic": "airport_specific",
        "source_id": "AEROPORT_CRAIOVA_SECURITY",
        "jurisdiction": ["RO"],
        "airportCodes": ["CRA"],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Passengers departing Craiova CRA should arrive at least 2 hours before Schengen flights and 2.5 hours before Non-Schengen flights.",
                "sourceSection": "Aeroportul Craiova - Recomandari orar pasageri",
                "sourceUrl": "https://aeroportcraiova.ro/controlul-de-securitate/"
            }
        ],
        "keywords_ro": ["sosire aeroport craiova", "cu cat timp inainte la craiova", "orar plecari craiova", "2 ore inainte craiova", "terminal craiova"],
        "keywords_en": ["arrival time craiova", "how early craiova airport", "craiova departures schedule", "2 hours early craiova", "craiova terminal"],
        "ro": {
            "title": "Aeroportul Craiova (CRA): timpul recomandat de sosire înainte de zbor",
            "text": "Administrația Aeroportului Internațional Craiova (CRA) recomandă tuturor pasagerilor să se prezinte la terminalul de plecări cu cel puțin 2 ore înainte de ora decolării programate pentru zborurile către destinații din spațiul Schengen (cum ar fi zborurile spre Italia, Belgia sau Germania). Pentru zborurile internaționale Non-Schengen (precum cursele către Londra sau alte destinații din afara spațiului Schengen), pasagerii sunt sfătuiți să sosească la aeroport cu cel puțin 2 ore și jumătate înainte de zbor, pentru a permite efectuarea verificărilor de securitate și a controlului pașapoartelor la frontiera de stat. Sosirea din timp este esențială deoarece ghișeele de predare a bagajelor se închid strict cu 40-45 de minute înainte de plecare, iar la orele de vârf în care decolează zboruri simultane se pot forma cozi la unicul filtru central de securitate al aerogării.",
            "questions": [
                "Cu cât timp înainte trebuie să ajung la Aeroportul Craiova pentru un zbor?",
                "la ce ora sa fiu la aeroportul din Craiova daca zbor la Londra",
                "cat dureaza controlul si check-inul la aeroportul Craiova",
                "recomandare timp de sosire zboruri Schengen pe aeroportul Craiova",
                "cand se aglomereaza terminalul la plecari Craiova CRA"
            ]
        },
        "en": {
            "title": "Craiova Airport (CRA): recommended passenger arrival timeline before departure",
            "text": "The management of Craiova International Airport (CRA) officially advises all departing passengers to arrive at the terminal building at least 2 hours prior to scheduled departure for flights operating to destinations within the Schengen area (such as regular services to Italy, Belgium, or Germany). For international Non-Schengen flights (such as services to London Luton or other non-EU destinations), travellers are strongly recommended to arrive at least 2.5 hours in advance to account for mandatory queueing at security screening checkpoints and Border Police passport control booths. Arriving well in advance is critical because luggage bag-drop desks strictly cease operations 40 to 45 minutes before departure, and peak operational periods with overlapping aircraft departures can lead to extended passenger queues at the terminal's central security checkpoint.",
            "questions": [
                "How early should I arrive at Craiova Airport before my flight?",
                "what time should I get to Craiova Airport for a flight to London",
                "how long do check-in and security take at Craiova Airport CRA?",
                "recommended arrival time for European Schengen flights at Craiova",
                "does Craiova airport security experience queues during morning peaks"
            ]
        }
    },
    {
        "concept_id": "apt_cra_parking_kiss_fly",
        "topic": "airport_specific",
        "source_id": "AEROPORT_CRAIOVA_SECURITY",
        "jurisdiction": ["RO"],
        "airportCodes": ["CRA"],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Craiova Airport features paid passenger parking with automated barrier ticket machines and designated drop-off lanes.",
                "sourceSection": "Aeroportul Craiova - Regulament Parcare Publica",
                "sourceUrl": "https://aeroportcraiova.ro/controlul-de-securitate/"
            }
        ],
        "keywords_ro": ["parcare aeroport craiova", "kiss and fly craiova", "taxa parcare craiova", "lasat pasageri craiova", "tichete parcare craiova"],
        "keywords_en": ["craiova airport parking", "kiss and fly craiova", "parking fee craiova", "passenger drop-off craiova", "parking ticket barrier craiova"],
        "ro": {
            "title": "Aeroportul Craiova (CRA): regulamentul de parcare și zona de debarcare (Kiss & Fly)",
            "text": "Aeroportul Internațional Craiova pune la dispoziția conducătorilor auto o parcare publică amenajată în fața terminalului de pasageri, prevăzută cu bariere automate de control al accesului și sistem electronic de eliberare a tichetelor la intrare. Pentru debarcarea rapidă a pasagerilor și descărcarea bagajelor (conceptul Kiss & Fly), autovehiculele pot utiliza banda specială de oprire scurtă din fața terminalului. Staționarea pe termen lung este permisă în parcarea publică contra cost, tarifele fiind calculate pe oră sau pe zi conform grilei afișate la intrarea în perimetru. Plata parcării se efectuează obligatoriu înainte de părăsirea incintei, la automatele de plată din fața terminalului (cu numerar sau card bancar). Pierderea tichetului de parcare atrage plata unei taxe administrative de penalizare.",
            "questions": [
                "Unde pot parca mașina la Aeroportul Craiova și cât costă?",
                "exista zona de lasat pasageri kiss and fly la Craiova",
                "cum se plateste parcarea la aeroportul Craiova",
                "pot lasa masina in parcarea aeroportului Craiova o saptamana?",
                "ce se intampla daca pierd tichetul de parcare la aeroportul craiova"
            ]
        },
        "en": {
            "title": "Craiova Airport (CRA): public parking regulations and passenger drop-off zones",
            "text": "Craiova International Airport provides a dedicated public vehicle parking facility directly situated in front of the passenger terminal complex, secured with automated entry barriers and electronic ticket dispensing machines. For swift passenger drop-off and luggage unloading (Kiss & Fly), vehicles may access designated short-stop lanes near terminal entrances. Long-term parking is permitted in the designated public bays subject to published parking tariffs calculated on an hourly or daily basis as indicated on the entrance tariff boards. Parking charges must be settled prior to retrieving the vehicle using the automated payment kiosks installed outside the terminal building, which accept both cash and contactless bank payment cards. Misplacing the parking barrier ticket incurs a mandatory administrative penalty surcharge.",
            "questions": [
                "Where can I park my car at Craiova Airport and how much does it cost?",
                "is there a Kiss and Fly short drop-off lane at Craiova Airport",
                "how do I pay for parking at Craiova International Airport?",
                "can I leave my car in the Craiova airport car park for a week",
                "what is the penalty for losing a parking ticket at Craiova Airport"
            ]
        }
    },

    # ----------------------------------------------------
    # TOPIC 12: emergency (3 pairs = 6 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "emg_112_single_european_number",
        "topic": "emergency",
        "source_id": "EU_EMERGENCY_112",
        "jurisdiction": ["EU", "RO"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "112 is the single European emergency number for urgent medical, police or fire assistance at any EU airport.",
                "sourceSection": "European Commission DG CNECT 112 Policy",
                "sourceUrl": "https://digital-strategy.ec.europa.eu/en/policies/112"
            }
        ],
        "keywords_ro": ["numar urgenta 112", "urgenta medicala aeroport", "politie aeroport", "salvare 112", "apel urgenta gratuit", "ajutor medical imediat"],
        "keywords_en": ["emergency number 112", "medical emergency airport", "airport police", "ambulance 112", "free emergency call", "immediate medical help"],
        "ro": {
            "title": "Numărul unic european de urgență 112: intervenții urgente în aeroport",
            "text": "Numărul de telefon 112 este numărul unic de urgență valabil gratuit pe întreg teritoriul Uniunii Europene, inclusiv în toate aeroporturile din România și din statele membre. Numărul poate fi apelat gratuit de pe orice telefon mobil sau fix, chiar și de pe telefoane fără cartelă SIM, fără credit sau blocate cu cod PIN. În caz de urgență gravă survenită în incinta aeroportului (stop cardio-respirator, pierderea cunoștinței, sângerare masivă, incendiu sau amenințare armată directă), pasagerii trebuie să apeleze imediat 112 pentru alertarea serviciilor specializate de intervenție (ambulanță, poliție, pompieri). Simultan, trebuie alertat cel mai apropiat angajat al aeroportului, agent de securitate sau birou de informații, deoarece personalul aeroportuar este instruit în prim-ajutor și poate ghida echipajele medicale în zonele securizate airside.",
            "questions": [
                "Ce număr sun în caz de urgență medicală gravă în aeroport?",
                "pot apela 112 gratuit de pe telefon fara roaming in aeroport",
                "ce fac daca cineva lesina sau are stop cardiac in terminalul aeroportului",
                "cum chem salvarea sau politia la un aeroport din Romania",
                "functioneaza numarul 112 pe toate aeroporturile din Uniunea Europeana"
            ]
        },
        "en": {
            "title": "112 Single European Emergency Number: life-safety interventions at airports",
            "text": "Telephone number 112 is the universal Single European Emergency Number operating completely free of charge across all European Union Member States, accessible within all Romanian and European commercial airport facilities. Dialing 112 connects instantly to local emergency dispatch services (medical ambulance, police forces, and fire rescue). Calls to 112 can be placed from any fixed landline or mobile telephone, including phones without active roaming plans, prepaid credit, or even mobile handsets lacking a physical SIM card. In the event of a critical life-threatening emergency within an airport terminal (such as cardiac arrest, sudden collapse, severe trauma, active fire, or armed threat), passengers should immediately dial 112. Concurrently, passengers must notify the nearest airport employee or security officer, who can immediately initiate on-site first aid and expedite emergency vehicle gate access into restricted airside zones.",
            "questions": [
                "What number should I call for a critical medical emergency at the airport?",
                "can I dial 112 for free without mobile roaming at European airports",
                "what should I do if someone collapses with cardiac arrest inside the terminal",
                "how do I call an ambulance or police at an airport in Europe?",
                "does the 112 emergency service operate at every airport in the EU"
            ]
        }
    },
    {
        "concept_id": "emg_aed_defibrillators_terminals",
        "topic": "emergency",
        "source_id": "EU_EMERGENCY_112",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Automated External Defibrillators (AED) are positioned across airport terminals and can be operated by any person following voice prompts.",
                "sourceSection": "European Resuscitation Council Airport Public Access Defibrillation Guidelines",
                "sourceUrl": "https://digital-strategy.ec.europa.eu/en/policies/112"
            }
        ],
        "keywords_ro": ["defibrilator automat aed", "stop cardiac aeroport", "resuscitare prim ajutor", "defibrilator public", "cutie aed verde", "instructiuni vocale defibrilator"],
        "keywords_en": ["automated external defibrillator aed", "cardiac arrest airport", "cpr first aid", "public access defibrillator", "green aed cabinet", "defibrillator voice instructions"],
        "ro": {
            "title": "Defibrilatoare externe automate (AED) în aeroporturi: utilizare și prim-ajutor",
            "text": "Aeroporturile europene sunt dotate cu defibrilatoare externe automate (AED - Automated External Defibrillator), amplasate în carcase murale semnalizate clar cu pictograma internațională verde (o inimă albă cu fulger verde). Aceste dispozitive medicale de urgență sunt concepute special pentru a putea fi utilizate de orice persoană prezentă, chiar și fără pregătire medicală anterioară, în cazul în care un pasager suferă un stop cardio-respirator. La deschiderea carcasei și pornirea aparatului, defibrilatorul emite instrucțiuni vocale clare, pas cu pas, ghidând utilizatorul cum să aplice electrozii adezivi pe pieptul pacientului. Aparatul analizează automat ritmul cardiac și decide dacă este necesar un șoc electric, declanșând șocul doar dacă detectează fibrilație ventriculară. Utilizarea unui AED în primele 3-5 minute crește dramatic șansele de supraviețuire până la sosirea medicilor.",
            "questions": [
                "Unde găsesc un defibrilator în aeroport și cum îl folosesc dacă cineva are stop cardiac?",
                "poate orice persoana sa foloseasca un defibrilator AED in aeroport",
                "cum arata semnul pentru defibrilator automat in terminal",
                "ce face un defibrilator AED daca pacientul nu are nevoie de soc electric",
                "ce pasi urmez daca o persoana este inconstienta si nu respira in aeroport"
            ]
        },
        "en": {
            "title": "Automated External Defibrillators (AED) in terminals: public access and life support",
            "text": "European commercial airports are extensively equipped with Automated External Defibrillators (AEDs) positioned in prominent, wall-mounted storage cabinets marked by the standardized green universal symbol depicting a white heart with a green lightning cross. These life-saving devices are deliberately engineered for immediate operation by untrained laypersons witnessing sudden cardiac arrest. Upon opening the cabinet and powering on the device, the automated unit delivers clear, step-by-step spoken vocal commands instructing the rescuer exactly how to attach the self-adhesive electrode pads to the patient's bare chest. The integrated diagnostic computer automatically analyzes heart rhythms and will only administer an electrical shock if a shockable rhythm (such as ventricular fibrillation) is identified, making it impossible to shock someone erroneously. Deploying an AED within the first 3 to 5 minutes dramatically boosts survival rates.",
            "questions": [
                "Where can I find an AED defibrillator in an airport and how is it used?",
                "can any untrained person safely operate an airport AED defibrillator",
                "what does the universal symbol for an automated external defibrillator look like",
                "will an AED accidentally deliver an electric shock if it is not needed?",
                "what are the critical first steps if someone collapses unconscious at an airport"
            ]
        }
    },
    {
        "concept_id": "emg_terminal_evacuation_alarms",
        "topic": "emergency",
        "source_id": "EU_EMERGENCY_112",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "During terminal evacuation alarms, passengers must immediately leave cabin baggage behind and follow green illuminated emergency exit signs.",
                "sourceSection": "ICAO Annex 14 Aerodrome Emergency Planning & Aviation Fire Safety",
                "sourceUrl": "https://digital-strategy.ec.europa.eu/en/policies/112"
            }
        ],
        "keywords_ro": ["alarma evacuare aeroport", "iesiri de urgenta", "abandonare bagaje evacuare", "semne verzi evacuare", "incendiu terminal", "instructiuni securitate"],
        "keywords_en": ["airport evacuation alarm", "emergency exits", "leave baggage behind evacuation", "green exit signs", "terminal fire", "security instructions"],
        "ro": {
            "title": "Alarma de evacuare în terminal: reguli stricte de salvare și ieșiri de urgență",
            "text": "În cazul declanșării alarmei sonore de incendiu sau a unui ordin vocal de evacuare transmis prin sistemul de sonorizare al aeroportului, toți pasagerii au obligația legală strictă de a respecta procedurile de urgență pentru salvarea vieții. Regula fundamentală de securitate este abandonarea imediată a oricărui bagaj voluminos de mână, troller sau cărucior. Încercarea de a salva bagajele blochează căile înguste de evacuare, provoacă busculade și încetinește critic fluxul de salvare. Pasagerii trebuie să urmeze cu calm indicatoarele luminoase de culoare verde care marchează ieșirile de urgență (Emergency Exit) și să respecte fără ezitare dispozițiile forțelor de ordine, ale pompierilor și ale personalului de securitate aeroportuar. Odată ajunși în exteriorul clădirii, pasagerii trebuie să se deplaseze către punctele de adunare desemnate și să nu reintre în terminal fără autorizare.",
            "questions": [
                "Ce trebuie să fac dacă sună alarma de evacuare în aeroport?",
                "am voie sa imi iau valiza de mana daca se ordona evacuarea terminalului",
                "cum gasesc iesirile de urgenta in caz de incendiu la aeroport",
                "de ce este strict interzis sa cari bagaje mari in timpul unei evacuari de urgenta",
                "unde trebuie sa merg dupa ce ies din aeroport la o alarma de securitate"
            ]
        },
        "en": {
            "title": "Terminal building evacuation alarms: life-safety protocol and emergency exit routing",
            "text": "Whenever an audible fire siren sounds or a formal vocal evacuation directive is broadcast across the airport public address system, all occupants are legally bound to execute emergency evacuation protocols without delay. The paramount life-safety regulation requires all passengers to immediately abandon large cabin baggage, wheeled trolley suitcases, and duty-free shopping bags. Attempting to retrieve or transport bulky luggage severely obstructs egress corridors, creates fatal pedestrian bottlenecks, and critically impairs rapid evacuation. Passengers must calmly follow illuminated green emergency exit signs marking designated escape pathways and comply instantly with instructions from airport security personnel, fire brigades, and police officers. Upon exiting the terminal structure, individuals must proceed directly to designated outdoor assembly zones and refrain from re-entering the building until official 'all-clear' authorization is declared.",
            "questions": [
                "What should I do if an emergency evacuation alarm sounds inside the airport?",
                "am I allowed to take my carry-on suitcase if terminal evacuation is ordered",
                "how do I identify emergency exits during an airport terminal fire alarm",
                "why is taking cabin luggage strictly prohibited during an airport evacuation",
                "where do passengers gather after evacuating an airport terminal building"
            ]
        }
    }
]
