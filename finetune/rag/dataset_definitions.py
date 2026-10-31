# Factual definitions for FlightFlow offline RAG corpus
# All 42 bilingual concept pairs (84 chunks) covering all 12 topics.
# Each chunk is strictly written to be between 80 and 220 words.

CONCEPTS = [
    # ----------------------------------------------------
    # TOPIC 1: security (4 pairs = 8 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "sec_liquids_100ml",
        "topic": "security",
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
                "claim": "Maximum container volume of 100 ml packed in one 1-litre transparent resealable bag per passenger.",
                "sourceSection": "Attachment 4-A Liquids, Aerosols and Gels (LAGs)",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998"
            }
        ],
        "keywords_ro": ["lichide", "control securitate", "100 ml", "punga transparenta", "1 litru", "geluri", "pasta de dinti", "parfum"],
        "keywords_en": ["liquids", "security screening", "100 ml", "transparent bag", "1 litre", "gels", "toothpaste", "perfume"],
        "ro": {
            "title": "Regula lichidelor în bagajul de mână (100 ml și punga de 1 litru)",
            "text": "La punctele de control de securitate din aeroporturile Uniunii Europene, toate lichidele, aerosolii și gelurile (LAGs) transportate în bagajul de cabină trebuie să fie ambalate în recipiente individuale cu o capacitate maximă de cel mult 100 de mililitri (sau 100 de grame) fiecare. Recipientele cu un volum mai mare de 100 ml nu sunt permise prin filtrul de securitate, chiar dacă sunt doar parțial umplute. Toate aceste recipiente trebuie să încapă lejer într-o singură pungă de plastic transparentă, resigilabilă, cu o capacitate totală de maximum 1 litru și dimensiuni aproximative de 20 pe 20 centimetri. Fiecare pasager are dreptul la o singură astfel de pungă transparentă, care trebuie scoasă obligatoriu din bagajul de mână și așezată separat în tava de scanare la controlul cu raze X. Lichidele care depășesc aceste dimensiuni sau recipientele neresigilate vor fi confiscate definitiv la filtrul de securitate.",
            "questions": [
                "Câți ml de lichid am voie să iau în bagajul de mână?",
                "cati ml de apa am voie la bagaj de mana",
                "pot lua parfum de 150ml daca e pe jumatate gol?",
                "care e regula cu punga transparenta de un litru la aeroport",
                "am voie cu pasta de dinti in cabina avionului"
            ]
        },
        "en": {
            "title": "Liquids rule in cabin baggage (100 ml containers and 1-litre bag)",
            "text": "At airport security checkpoints across the European Union, all liquids, aerosols, and gels (LAGs) carried in cabin hand luggage must be contained in individual receptacles with a maximum capacity of 100 millilitres (or 100 grams) each. Any container larger than 100 ml will be refused at security screening, even if it is only partially filled. All liquid containers must fit comfortably inside a single transparent, resealable plastic bag with a total volume not exceeding 1 litre and dimensions of approximately 20 by 20 centimetres. Each passenger is permitted only one such transparent plastic bag. Passengers must take this bag out of their carry-on baggage and present it separately in the security screening tray for X-ray examination. Any non-compliant liquids or containers that cannot fit in the resealable bag must be discarded before passing through the security checkpoint.",
            "questions": [
                "How many ml of liquids can I bring in carry-on luggage?",
                "can I bring a 150ml bottle if it is half empty?",
                "what is the 100ml liquid rule at EU airport security",
                "do I need a clear plastic bag for liquids in cabin luggage?",
                "is toothpaste considered a liquid at airport security"
            ]
        }
    },
    {
        "concept_id": "sec_liquids_baby_food",
        "topic": "security",
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
                "claim": "Exemption from 100 ml limit for baby milk, sterilized water and baby food needed during the journey.",
                "sourceSection": "Attachment 4-A Exemptions for essential baby foods",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998"
            }
        ],
        "keywords_ro": ["mancare bebelus", "lapte praf", "ceai bebelusi", "control securitate", "exceptie lichide", "biberon", "copii mici"],
        "keywords_en": ["baby food", "baby milk", "infant formula", "security exemption", "liquids exemption", "sterilized water", "baby bottle"],
        "ro": {
            "title": "Excepții de securitate: hrana și laptele pentru bebeluși",
            "text": "Hrana pentru bebeluși, laptele praf preparat, laptele matern și apa sterilizată destinate utilizării pe durata călătoriei sunt exceptate de la restricția strictă de 100 de mililitri și nu trebuie să fie introduse în punga transparentă de 1 litru. Pasagerii care călătoresc însoțiți de un sugar sau copil mic au voie să transporte cantitatea rezonabilă de alimente lichide sau piureuri necesară pentru durata zborului și eventualele întârzieri. La filtrul de control al securității, aceste alimente și biberoane trebuie prezentate separat ofițerilor de securitate. Personalul de securitate are obligația legală de a verifica recipientele prin metode specifice de scanare suplimentară, putând solicita deschiderea recipientelor sau testarea conținutului cu un dispozitiv de analiză a vaporilor. Alimentele care nu sunt destinate consumului direct pe durata călătoriei trebuie ambalate în bagajul de cală.",
            "questions": [
                "Pot lua lapte pentru bebeluș în avion peste 100 ml?",
                "am voie cu apa sterilizata si piure pentru copil mic la control",
                "se confisca laptele de bebelus la securitate?",
                "cat lapte praf am voie in bagajul de mana",
                "care e regula pentru mancarea de bebelusi la aeroport"
            ]
        },
        "en": {
            "title": "Security exemptions: baby food and infant milk in cabin luggage",
            "text": "Baby food, formula milk, expressed breast milk, and sterilized water needed for consumption during the journey are legally exempt from the standard 100 millilitre liquid restriction and do not need to fit inside the standard 1-litre transparent bag. Passengers travelling with an infant or small child are permitted to carry a reasonable quantity of liquid infant nutrition required for the flight duration and potential travel delays. At the airport security screening checkpoint, these items and baby bottles must be declared and presented separately from other hand luggage. Security personnel may perform additional screening on baby liquids, including screening with specialized liquid explosive detection scanners or requesting authentication. Liquid baby food that is not strictly required during the flight must be packed into checked hold baggage.",
            "questions": [
                "Can I take more than 100 ml of baby milk through security?",
                "is baby formula allowed in carry on luggage at EU airports",
                "what is the rule for infant water and baby jars through airport security?",
                "do baby bottles have to fit in the clear liquid bag",
                "can security officers test my baby milk"
            ]
        }
    },
    {
        "concept_id": "sec_liquids_duty_free_steb",
        "topic": "security",
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
                "claim": "Duty-free liquids allowed through transit security if sealed inside an authorized STEB bag with proof of purchase.",
                "sourceSection": "Attachment 4-A Security Tamper-Evident Bag (STEB) provisions",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998"
            }
        ],
        "keywords_ro": ["duty free", "punga steb", "alcool duty free", "parfum", "sigilat", "tranzit aeroport", "bon fiscal"],
        "keywords_en": ["duty free", "steb bag", "duty free alcohol", "perfume", "tamper evident", "transit screening", "receipt"],
        "ro": {
            "title": "Lichide cumpărate din Duty-Free și punga sigilată STEB",
            "text": "Băuturile alcoolice, parfumurile și alte lichide achiziționate din magazinele duty-free din aeroporturile UE sau de la bordul avioanelor pot depăși limita standard de 100 de mililitri, cu condiția strictă de a rămâne sigilate într-o pungă securizată cu elemente vizibile de protecție împotriva deschiderii neautorizate (Security Tamper-Evident Bag - STEB). Punga trebuie furnizată de magazinul din aeroport și trebuie să conțină bonul fiscal original de cumpărare, așezat cu fața spre exterior pentru a fi lizibil fără desigilare. Dacă pasagerul are un zbor cu escală într-un alt aeroport din Uniunea Europeană, punga STEB nu trebuie deschisă sub nicio formă înainte de a trece de controlul de securitate de tranzit din aeroportul de transfer. Ruperea sigiliului sau lipsa bonului fiscal atrage confiscarea automată a recipientelor la zborurile de conexiune.",
            "questions": [
                "Pot lua o sticlă de băutură din duty free la un zbor cu escală?",
                "am voie cu parfum cumparat din aeroport la zbor de legatura",
                "ce este punga STEB pentru duty free",
                "ce se intampla daca deschid punga sigilata din duty free",
                "pot trece de securitate cu bautura cumparata dupa control"
            ]
        },
        "en": {
            "title": "Duty-free liquids in transit and sealed STEB tamper-evident bags",
            "text": "Alcoholic beverages, perfumes, and other liquids purchased from airport airside duty-free shops or on board European carriers may exceed the 100 millilitre limit, provided they remain sealed inside an official Security Tamper-Evident Bag (STEB). The retailer must package the goods in this designated bag with the itemized proof of purchase visibly displayed inside. If a passenger has a connecting flight at another airport, the STEB bag must remain completely unopened until arriving at the final destination. At intermediate transit security checkpoints, airport security officers will inspect the intact seal and scan the liquids. If the bag has been opened, punctured, or the receipt is missing, security officers will confiscate the liquids immediately. Passengers should never break the tamper-evident seal before completing their final flight.",
            "questions": [
                "Can I take duty free alcohol on a connecting flight?",
                "what is a STEB tamper evident bag for airport liquids",
                "can I bring duty free perfume through transit security",
                "what happens if I open my sealed duty free bag before my connection?",
                "are duty free bottles allowed past airport screening"
            ]
        }
    },
    {
        "concept_id": "sec_prohibited_sharp_items",
        "topic": "security",
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
                "claim": "Knives and scissors with blades over 6 cm are strictly prohibited in the passenger cabin.",
                "sourceSection": "Attachment 4-C Prohibited articles in cabin baggage",
                "sourceUrl": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998"
            }
        ],
        "keywords_ro": ["obiecte ascutite", "briceag", "cutit", "foarfeca", "lama 6 cm", "arme albe", "interzis cabina"],
        "keywords_en": ["sharp items", "pocket knife", "knife", "scissors", "6 cm blade", "prohibited cabin", "box cutter"],
        "ro": {
            "title": "Obiecte ascuțite și tăietoare interzise în cabina avionului",
            "text": "Conform reglementărilor europene de securitate aeronautică, obiectele cu vârf ascuțit sau lamă tăioasă capabile să producă vătămări corporale grave sunt strict interzise în cabina pasagerilor. Cuțitele, bricegele, uneltele multifuncționale și foarfecele cu o lamă mai lungă de 6 centimetri nu pot fi transportate în bagajul de mână sub nicio formă și vor fi reținute la filtrul de securitate. Lamele de ras neprotejate, cutterele și săbiile sunt de asemenea interzise în cabină. Obiectele ascuțite permise prin excepție (cum ar fi foarfecele mici de unghii cu lame sub 6 cm) pot fi totuși refuzate de anumiți operatori aerieni sau inspectori de securitate dacă prezintă un risc perceput. Pentru a evita confiscarea, pasagerii sunt sfătuiți să transporte toate obiectele tăietoare, foarfecele și uneltele metalice exclusiv în bagajul de cală înregistrat.",
            "questions": [
                "Pot lua un briceag în bagajul de mână?",
                "am voie cu foarfeca de unghii in cabina avionului",
                "care este lungimea maxima a lamei permise la securitate aeroport",
                "se confisca cutitul elvetian la controlul bagajelor de mana",
                "unde trebuie sa pun forfecuta de unghii cand zbor"
            ]
        },
        "en": {
            "title": "Prohibited sharp objects and pointed weapons in cabin baggage",
            "text": "Under European Union civil aviation security regulations, sharp and pointed items capable of causing serious injury are strictly prohibited in aircraft passenger cabins. Knives, multi-tools, pocket knives, and scissors with blades exceeding 6 centimetres in length cannot be carried in cabin baggage under any circumstances and will be confiscated at security screening. Box cutters, open razor blades, swords, and martial arts equipment are completely prohibited from hand luggage. While small scissors or files with blades shorter than 6 cm are technically permissible under EU baseline standards, individual airlines and local airport screening authorities retain the legal right to apply stricter bans. Passengers are strongly advised to pack all metal blades, scissors, pocket tools, and manicure implements securely into their checked hold baggage to prevent confiscation.",
            "questions": [
                "Can I bring a pocket knife in my cabin luggage?",
                "are scissors allowed through airport security check",
                "what is the maximum blade length allowed in carry on baggage?",
                "will security confiscate my swiss army knife at the airport",
                "can I take nail clippers and small scissors on an airplane"
            ]
        }
    },

    # ----------------------------------------------------
    # TOPIC 2: baggage (5 pairs = 10 chunks)
    # ----------------------------------------------------
    {
        "concept_id": "bag_powerbanks_carryon_only",
        "topic": "baggage",
        "source_id": "EASA_LITHIUM_BATTERIES",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Powerbanks and spare lithium batteries must be carried in cabin baggage only; forbidden in checked hold.",
                "sourceSection": "EASA SIB 2017-01 & IATA Dangerous Goods Table 2.3.A",
                "sourceUrl": "https://www.easa.europa.eu/en/domains/passengers/passengers-dangerous-goods"
            }
        ],
        "keywords_ro": ["powerbank", "baterie externa", "acumulator litiu", "bagaj cala interzis", "bagaj mana", "incendiu cala", "100 wh"],
        "keywords_en": ["powerbank", "external battery", "lithium battery", "checked baggage forbidden", "carry-on only", "fire hazard", "100 wh"],
        "ro": {
            "title": "Baterii externe și powerbank-uri: obligatoriu în bagajul de mână",
            "text": "Bateriile externe portabile (powerbanks), acumulatorii externi și bateriile litiu-ion de rezervă sunt strict interzise în bagajul de cală și trebuie transportate exclusiv în bagajul de mână (în cabina pasagerilor). Această măsură de siguranță internațională este impusă deoarece bateriile litiu prezintă riscul de ambalare termică și autoaprindere, iar un eventual incendiu în cala avionului este mult mai greu de detectat și stins rapid. În cabină, echipajul de zbor este instruit și echipat special pentru a izola imediat orice dispozitiv electronic supraîncălzit. Bateriile externe luate în cabină trebuie să aibă o capacitate de cel mult 100 Watt-oră (Wh). Terminalele acumulatorilor de rezervă trebuie protejate împotriva scurtcircuitelor prin amplasarea în ambalajul original, prin acoperirea contactelor cu bandă izolatoare sau prin depozitarea în pungi individuale de protecție.",
            "questions": [
                "Pot pune o baterie externă în bagajul de cală?",
                "unde se tine powerbankul in avion, cala sau mana",
                "de ce e interzis powerbankul la cala",
                "am voie cu acumulator extern in bagajul de cabina",
                "ce se intampla daca las bateria externa in valiza de cala"
            ]
        },
        "en": {
            "title": "Powerbanks and spare batteries: strictly in cabin hand baggage",
            "text": "Portable external powerbanks, spare lithium-ion batteries, and power packs are strictly prohibited inside checked hold luggage and must be transported exclusively in cabin hand luggage. This mandatory international aviation safety rule is enforced because lithium batteries carry a proven risk of thermal runaway and sudden in-flight fire, which is exceedingly difficult to suppress inside an aircraft cargo hold. In the passenger cabin, flight attendants are specifically trained and equipped with fire containment bags to handle battery thermal incidents immediately. Standard powerbanks carried in cabin baggage must not exceed an energy rating of 100 Watt-hours (Wh). Passengers must also protect battery terminals from short-circuiting by keeping them in their original packaging, taping over exposed electrical terminals, or placing each battery inside a separate protective pouch.",
            "questions": [
                "Can I pack a power bank in my checked suitcase?",
                "where do powerbanks go on a plane carry on or hold",
                "why are external batteries banned from checked baggage?",
                "are portable phone chargers allowed in cabin luggage",
                "what happens if I forget a power bank in my checked bag"
            ]
        }
    },
    {
        "concept_id": "bag_powerbank_rating_limits",
        "topic": "baggage",
        "source_id": "EASA_LITHIUM_BATTERIES",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Batteries up to 100 Wh allowed freely; 100-160 Wh require airline approval; over 160 Wh strictly banned.",
                "sourceSection": "IATA Dangerous Goods Regulations Passenger Provisions",
                "sourceUrl": "https://www.easa.europa.eu/en/domains/passengers/passengers-dangerous-goods"
            }
        ],
        "keywords_ro": ["capacitate baterie", "watt ora", "100 wh", "160 wh", "aprobare companie", "mah baterie externa", "laptop baterie"],
        "keywords_en": ["battery capacity", "watt hours", "100 wh", "160 wh", "airline approval", "mah rating", "laptop battery"],
        "ro": {
            "title": "Limitele de capacitate pentru baterii litiu (100 Wh, 160 Wh)",
            "text": "Reglementările aeronautice EASA și IATA clasifică bateriile litiu-ion în funcție de capacitatea energetică exprimată în Watt-oră (Wh). Bateriile și powerbank-urile de până la 100 Wh (aproximativ 27.000 mAh la o tensiune de 3.7V) sunt permise liber în bagajul de mână pentru uz personal, fără a necesita vreo aprobare specială. Bateriile mari cu o capacitate cuprinsă între 100 Wh și 160 Wh (întâlnite frecvent la drone profesionale, camere video sau echipamente medicale) necesită solicitarea aprobării prealabile din partea companiei aeriene înainte de plecare, fiind permis un număr de cel mult două bucăți de rezervă per pasager. Bateriile externe și acumulatorii litiu cu o capacitate ce depășește 160 Wh sunt strict interzise la transportul aerian civil pe aeronavele de pasageri, indiferent de modalitatea de ambalare. Eticheta fabricantului cu specificația Wh trebuie să fie perfect vizibilă.",
            "questions": [
                "Câți mAh poate avea o baterie externă în avion?",
                "am voie cu baterie de drona de 140 Wh in avion",
                "ce inseamna limita de 100 Wh la baterii externe",
                "se poate zbura cu baterii de peste 160 watt ora",
                "cum calculez daca powerbankul meu are sub 100 Wh"
            ]
        },
        "en": {
            "title": "Capacity rating limits for lithium batteries (100 Wh, 160 Wh thresholds)",
            "text": "EASA and IATA air transport safety rules categorize lithium-ion batteries by their energy capacity measured in Watt-hours (Wh). Batteries and external powerbanks rated up to 100 Wh (roughly equivalent to 27,000 mAh at 3.7 volts) are permitted in cabin baggage for personal use without prior operator approval. Larger spare batteries rated between 100 Wh and 160 Wh (commonly utilized in professional video cameras, consumer drones, and medical equipment) strictly require advance airline permission before departure, and each passenger is restricted to a maximum of two spare batteries in this category. Any lithium battery exceeding 160 Wh is entirely prohibited from passenger transport aircraft under international safety regulations. Passengers must ensure that the manufacturer's specification label stating the Wh rating remains clearly legible on the battery casing.",
            "questions": [
                "What is the maximum mAh allowed for powerbanks on a plane?",
                "can I bring a 140 Wh camera battery on an airplane",
                "what does the 100 watt hour limit mean for travel chargers",
                "are batteries over 160 Wh allowed on commercial flights",
                "how do I convert mAh to Watt hours for airport security"
            ]
        }
    },
    {
        "concept_id": "bag_lost_delayed_pir_report",
        "topic": "baggage",
        "source_id": "MONTREAL_CONVENTION_1999",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Passengers must obtain a Property Irregularity Report (PIR) at arrivals before leaving the baggage reclaim area.",
                "sourceSection": "Montreal Convention 1999 Article 17 Baggage Handling",
                "sourceUrl": "https://www.icao.int/secretariat/legal/list%20of%20parties/mtl99_en.pdf"
            }
        ],
        "keywords_ro": ["bagaj pierdut", "raport pir", "birou lost and found", "eticheta bagaj", "valiza nu a sosit", "sosiri aeroport"],
        "keywords_en": ["lost luggage", "pir report", "lost and found desk", "baggage tag", "missing suitcase", "airport arrivals"],
        "ro": {
            "title": "Bagaj pierdut sau întârziat: întocmirea raportului PIR în aeroport",
            "text": "Dacă bagajul de cală înregistrat nu apare pe banda de restituire la sosirea la destinație, pasagerul trebuie să se prezinte imediat la biroul de asistență pentru bagaje (Baggage Service / Lost and Found) din zona de sosiri a aeroportului, înainte de a părăsi zona vamală. Pasagerul este obligat să completeze formularul oficial de neregularitate a bagajelor, cunoscut sub numele de PIR (Property Irregularity Report), furnizând descrierea exactă a valizei și datele de contact. Numărul unic de referință al raportului PIR și tichetul de identificare a bagajului (baggage tag) primit la check-in trebuie păstrate cu grijă, deoarece sunt esențiale pentru urmărirea online a valizei și depunerea ulterioară a cererilor de despăgubire. Părăsirea zonei de sosiri a aeroportului fără întocmirea raportului PIR poate compromite grav capacitatea pasagerului de a dovedi responsabilitatea transportatorului aerian.",
            "questions": [
                "Nu mi-a sosit bagajul la aeroport, ce trebuie să fac?",
                "ce este raportul PIR pentru valiza pierduta",
                "unde gasesc biroul lost and found daca nu vine bagajul",
                "ce fac daca plec din aeroport fara sa declar bagajul pierdut",
                "de ce am nevoie de eticheta bagajului pentru reclamatie"
            ]
        },
        "en": {
            "title": "Lost or delayed baggage: filing the PIR report at the airport",
            "text": "If checked hold baggage fails to arrive on the luggage carousel at your destination, you must report the issue immediately at the airport baggage service desk (Lost and Found / Baggage Reclaim desk) before exiting the arrivals customs hall. The passenger must complete an official Property Irregularity Report (PIR), providing a detailed physical description of the suitcase and current contact information. The unique PIR file reference number and the original baggage check tag provided during check-in must be securely retained, as they are mandatory evidence for tracking the missing bag in international tracing systems and for subsequent legal compensation claims. Leaving the airport arrivals area without formally registering a PIR drastically weakens your legal standing and makes it extremely difficult to prove that the loss occurred while in the carrier's custody.",
            "questions": [
                "My suitcase didn't arrive on the carousel, what should I do?",
                "what is a PIR report for missing luggage",
                "where do I go if my checked baggage is missing at the airport?",
                "can I file a lost bag report after leaving the airport",
                "why do I need the baggage claim tag receipt"
            ]
        }
    },
    {
        "concept_id": "bag_damage_7day_deadline",
        "topic": "baggage",
        "source_id": "MONTREAL_CONVENTION_1999",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Written complaint for damaged baggage must be filed with the airline within 7 days of receipt.",
                "sourceSection": "Montreal Convention 1999 Article 31(2)",
                "sourceUrl": "https://www.icao.int/secretariat/legal/list%20of%20parties/mtl99_en.pdf"
            }
        ],
        "keywords_ro": ["bagaj deteriorat", "valiza sparta", "reclamatie 7 zile", "termen legal", "despagubire valiza", "plangere scrisa"],
        "keywords_en": ["damaged baggage", "broken suitcase", "7 day claim", "statutory deadline", "luggage compensation", "written complaint"],
        "ro": {
            "title": "Bagaj deteriorat: termenul legal de reclamație de 7 zile",
            "text": "În cazul în care bagajul de cală ajunge deteriorat, spart, rupt sau cu obiecte lipsă, pasagerul are dreptul legal de a solicita despăgubiri de la transportatorul aerian în baza Convenției de la Montreal. O reclamație scrisă oficială trebuie trimisă companiei aeriene în termen strict de cel mult 7 zile calendaristice de la data la care bagajul a fost preluat de pasager. Depășirea acestui termen legal de 7 zile duce la decăderea din drepturi și la respingerea automată a oricărei cereri de compensare. Pentru a susține cererea, pasagerul trebuie să anexeze o copie a raportului PIR întocmit în aeroport, fotografii clare ale avariilor vizibile, eticheta de bagaj originală, cartea de îmbarcare și chitanțe sau devize doveditoare pentru reparația ori înlocuirea valizei. Uzura normală minoră (zgârieturi ușoare sau pete) nu este de regulă despăgubită.",
            "questions": [
                "În câte zile pot reclama o valiză ruptă după zbor?",
                "mi-a ajuns valiza sparta din avion ce acte trimit la companie",
                "care este termenul pentru bagaj deteriorat conform conventiei montreal",
                "ce se intampla daca trec cele 7 zile de la primirea bagajului avariat",
                "plateste compania aeriana reparatia trollerului spart"
            ]
        },
        "en": {
            "title": "Damaged baggage claims: the mandatory 7-day statutory deadline",
            "text": "If checked hold baggage arrives damaged, broken, torn, or with contents pilfered, the passenger is legally entitled to financial compensation under Article 31 of the Montreal Convention. An official written complaint must be submitted to the operating airline within a strict statutory deadline of 7 calendar days from the date the baggage was received. Failing to submit a written claim within this mandatory 7-day window will legally extinguish any right of action against the carrier. To successfully substantiate the claim, the passenger should attach a copy of the airport PIR report, high-resolution photographs detailing the damage, the original baggage luggage tag, the boarding pass, and receipts or formal repair estimates for the damaged luggage. Airlines generally do not cover minor superficial cosmetic wear such as light scuffs or dirt.",
            "questions": [
                "How many days do I have to report a damaged suitcase to the airline?",
                "my luggage arrived cracked after my flight what documents do I need",
                "what is the Montreal Convention 7 day damage deadline for baggage?",
                "can the airline deny my claim if I report damage after 7 days",
                "will airlines pay to replace a broken wheel or handle"
            ]
        }
    },
    {
        "concept_id": "bag_delay_21day_deadline",
        "topic": "baggage",
        "source_id": "MONTREAL_CONVENTION_1999",
        "jurisdiction": ["EU", "RO", "International"],
        "airportCodes": [],
        "airlines": [],
        "validFrom": "2024-01-01",
        "validUntil": None,
        "mayChange": True,
        "verification": "verified",
        "citations": [
            {
                "claim": "Written complaint for delayed baggage within 21 days; baggage missing over 21 days is treated as lost (up to 1,288 SDR limit).",
                "sourceSection": "Montreal Convention 1999 Articles 22 and 31(2)",
                "sourceUrl": "https://www.icao.int/secretariat/legal/list%20of%20parties/mtl99_en.pdf"
            }
        ],
        "keywords_ro": ["bagaj intarziat", "termen 21 zile", "cheltuieli urgente", "1288 dst", "limita despagubire", "bagaj pierdut definitiv"],
        "keywords_en": ["delayed luggage", "21 day deadline", "essential expenses", "1288 sdr", "liability limit", "permanently lost baggage"],
        "ro": {
            "title": "Bagaj întârziat: termenul de 21 de zile și plafonul de răspundere (1.288 DST)",
            "text": "Dacă bagajul de cală a întârziat, pasagerul trebuie să depună o reclamație scrisă către compania aeriană în termen de maximum 21 de zile calendaristice de la data la care bagajul i-a fost efectiv livrat sau pus la dispoziție. Pe durata în care se află fără bagaj departe de casă, pasagerul are dreptul de a cumpăra articole strict esențiale de primă necesitate (articole de igienă personală, lenjerie, haine de schimb) și de a solicita decontarea acestora pe baza bonurilor fiscale păstrate. Dacă bagajul nu este găsit și returnat după scurgerea a 21 de zile consecutive de la data sosirii zborului, acesta este declarat oficial pierdut definitiv. Răspunderea maximă a companiei aeriene pentru întârziere, distrugere sau pierdere este plafonată conform Convenției de la Montreal la aproximativ 1.288 de Drepturi Speciale de Tragere (DST) per pasager.",
            "questions": [
                "Cât timp am la dispoziție să cer banii pentru un bagaj întârziat?",
                "dupa cate zile este considerat un bagaj pierdut definitiv de companie",
                "pot cumpara haine daca nu mi-a ajuns bagajul si imi deconteaza compania?",
                "care este suma maxima de despagubire pentru bagaj pierdut in DST",
                "ce acte trimit pentru decontarea hainelor de urgenta"
            ]
        },
        "en": {
            "title": "Delayed baggage: the 21-day claim window and liability limits (1,288 SDR)",
            "text": "For delayed checked baggage, passengers must lodge a written compensation claim with the airline within a maximum of 21 calendar days from the date the luggage was physically returned to them. While deprived of their luggage away from home, passengers are entitled to purchase reasonable and essential emergency replacement items (such as toiletries, basic clothing, and underwear) and claim reimbursement by submitting itemized purchase receipts. If the airline fails to locate and deliver the baggage within 21 consecutive days from the scheduled flight arrival, the luggage is legally declared permanently lost. Under the Montreal Convention, the airline's maximum financial liability for destroyed, lost, damaged, or delayed baggage is strictly capped at approximately 1,288 Special Drawing Rights (SDR) per passenger (around 1,600 EUR depending on current conversion rates).",
            "questions": [
                "What is the deadline to claim compensation for delayed luggage?",
                "after how many days is missing luggage legally considered lost",
                "can I buy emergency clothes if my bag is delayed and get reimbursed?",
                "what is the maximum airline liability limit in SDR for lost baggage",
                "do I need receipts to get refunded for essential items when bags are late"
            ]
        }
    }
]
