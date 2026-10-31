import hashlib
from datetime import datetime, timezone

def compute_sha256(text: str) -> str:
    norm = " ".join(text.strip().split())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()

OFFICIAL_SOURCES = {
    "EURLEX_261_2004": {
        "id": "EURLEX_261_2004",
        "name": "Regulation (EC) No 261/2004 establishing common rules on compensation and assistance to passengers in the event of denied boarding and of cancellation or long delay of flights",
        "publisher": "European Parliament and Council of the European Union",
        "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261",
        "jurisdiction": "EU",
        "publishedAt": "2004-02-11",
        "updatedAt": "2024-01-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official EU primary legislative act published in the Official Journal of the European Union.",
        "textSummary": "Regulation (EC) No 261/2004 sets passenger rights for flight delays (over 2, 3, or 4 hours depending on distance), cancellations, denied boarding (overbooking), and involuntary downgrading. Compensation amounts are 250 EUR for <=1500 km, 400 EUR for 1500-3500 km and intra-EU >1500 km, and 600 EUR for >3500 km. Care includes free meals, refreshments, two telephone calls/messages, and hotel accommodation when an overnight stay becomes necessary."
    },
    "EURLEX_1107_2006": {
        "id": "EURLEX_1107_2006",
        "name": "Regulation (EC) No 1107/2006 concerning the rights of disabled persons and persons with reduced mobility when travelling by air",
        "publisher": "European Parliament and Council of the European Union",
        "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1107",
        "jurisdiction": "EU",
        "publishedAt": "2006-07-05",
        "updatedAt": "2023-01-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official EU primary legislative act on disabled passenger and PRM assistance.",
        "textSummary": "Regulation (EC) No 1107/2006 guarantees free assistance to persons with disabilities and reduced mobility (PRM) at EU airports and on board aircraft. Passengers must pre-notify the airline or tour operator at least 48 hours before the published departure time. Up to two items of mobility equipment, including electric wheelchairs, are carried free of charge. Recognized assistance dogs are accommodated in the aircraft cabin at no extra charge."
    },
    "EURLEX_AVSEC_2015_1998": {
        "id": "EURLEX_AVSEC_2015_1998",
        "name": "Commission Implementing Regulation (EU) 2015/1998 laying down detailed measures for the implementation of the common basic standards on aviation security",
        "publisher": "European Commission",
        "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998",
        "jurisdiction": "EU",
        "publishedAt": "2015-11-05",
        "updatedAt": "2024-09-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official EU statutory instrument on liquids, aerosols, gels (LAGs) and prohibited cabin items.",
        "textSummary": "Commission Implementing Regulation (EU) 2015/1998 Attachment 4-C and 4-A: Liquids, aerosols and gels (LAGs) in hand luggage must be in containers of maximum 100 ml (or 100 g) capacity, fitted comfortably inside one transparent, re-sealable plastic bag of capacity not exceeding 1 litre (approx 20x20 cm). Exemptions apply to baby foods and essential liquid medicines required during the trip, as well as duty-free liquids sealed inside an authorized Security Tamper-Evident Bag (STEB) with proof of purchase. Blades and knives with blade length over 6 cm are strictly prohibited in the cabin."
    },
    "MONTREAL_CONVENTION_1999": {
        "id": "MONTREAL_CONVENTION_1999",
        "name": "Convention for the Unification of Certain Rules for International Carriage by Air (Montreal Convention 1999)",
        "publisher": "International Civil Aviation Organization (ICAO)",
        "url": "https://www.icao.int/secretariat/legal/list%20of%20parties/mtl99_en.pdf",
        "jurisdiction": "International",
        "publishedAt": "1999-05-28",
        "updatedAt": "2024-01-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "International treaty ratified by the European Union (Decision 2001/539/EC) and Romania.",
        "textSummary": "Montreal Convention 1999 Articles 17, 22, and 31: Carrier liability for lost, damaged, or delayed checked baggage is limited to 1,288 Special Drawing Rights (SDR) per passenger. Written complaints must be filed with the carrier within 7 days of receipt for damaged baggage, and within 21 days from the date the baggage was placed at the passenger's disposal for delayed baggage. Baggage missing for more than 21 days is declared lost."
    },
    "YOUR_EUROPE_AIR_RIGHTS": {
        "id": "YOUR_EUROPE_AIR_RIGHTS",
        "name": "Air passenger rights - Your Europe",
        "publisher": "European Commission",
        "url": "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm",
        "jurisdiction": "EU",
        "publishedAt": "2024-01-15",
        "updatedAt": "2026-05-20",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official public information portal of the European Union for citizen rights.",
        "textSummary": "Under EU air passenger rights, passengers flying from an EU airport or arriving into an EU airport on an EU airline are protected. Long delays of 3 hours or more at destination qualify for compensation unless caused by extraordinary circumstances. If a flight is delayed 5 hours or more, passengers can cancel their journey and receive a full ticket refund plus a return flight to the initial point of departure."
    },
    "POLITIA_FRONTIERA_SCHENGEN": {
        "id": "POLITIA_FRONTIERA_SCHENGEN",
        "name": "Condiții de călătorie în spațiul Schengen pe cale aeriană (Air Schengen) și regimul minorilor",
        "publisher": "Inspectoratul General al Poliției de Frontieră Române (IGPF)",
        "url": "https://www.politiadefrontiera.ro/ro/main/i-conditii-de-calatorie-in-spatiul-schengen-pe-cale-aeriana-36421.html",
        "jurisdiction": "RO",
        "publishedAt": "2024-03-31",
        "updatedAt": "2026-04-10",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "ro",
        "status": "verified",
        "statusReason": "Official state regulatory authority for Romanian border management under Decision (EU) 2024/210 and OUG 34/2024.",
        "textSummary": "Începând cu 31 martie 2024, România a aderat la spațiul Schengen cu frontierele aeriene și maritime. Persoanele care călătoresc către sau dinspre state Schengen nu mai trec prin controlul de frontieră la ghișee. Polițiștii de frontieră pot efectua controale de securitate și identificare inopinate, nesistematice. Minorii români care călătoresc în Schengen au nevoie de document de călătorie valabil (pașaport sau carte de identitate)."
    },
    "POLITIA_FRONTIERA_MINORI": {
        "id": "POLITIA_FRONTIERA_MINORI",
        "name": "Regimul de călătorie al minorilor cetățeni români conform Legii 248/2005 și OUG 34/2024",
        "publisher": "Poliția de Frontieră Română",
        "url": "https://www.politiadefrontiera.ro/ro/main/i-vacanta-incepe-cu-documentele-pregatite-cand-este-necesara-declaratia-notariala-pentru-minori-43983.html",
        "jurisdiction": "RO",
        "publishedAt": "2024-04-01",
        "updatedAt": "2026-06-15",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "ro",
        "status": "verified",
        "statusReason": "Official legal guidance issued by IGPF pursuant to Legea 248/2005 and OUG 34/2024.",
        "textSummary": "Minorul cetățean român care călătorește însoțit de ambii părinți are nevoie doar de pașaport sau carte de identitate valabilă. Dacă minorul călătorește însoțit de o altă persoană decât părinții (sau singur, când compania permite), este necesară declarația notarială a părinților, iar însoțitorul major trebuie să prezinte cazierul judiciar eliberat de autoritățile române."
    },
    "EASA_LITHIUM_BATTERIES": {
        "id": "EASA_LITHIUM_BATTERIES",
        "name": "Safety Information Bulletin SIB 2017-01 and Dangerous Goods Guidance on Lithium Batteries",
        "publisher": "European Union Aviation Safety Agency (EASA) & ICAO",
        "url": "https://www.easa.europa.eu/en/domains/passengers/passengers-dangerous-goods",
        "jurisdiction": "EU",
        "publishedAt": "2017-02-15",
        "updatedAt": "2024-05-12",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "en",
        "status": "verified",
        "statusReason": "Official EU aviation safety agency standard adopted across European civil aviation.",
        "textSummary": "Lithium metal and lithium ion batteries, including external portable powerbanks and spare batteries, must be carried in carry-on cabin baggage only and are strictly forbidden in checked baggage. Powerbanks must not exceed 100 Watt-hours (Wh). Powerbanks between 100 Wh and 160 Wh require airline operator approval. Powerbanks over 160 Wh are completely prohibited on passenger aircraft. E-cigarettes must remain in the cabin; using or charging them on board is strictly prohibited."
    },
    "EURLEX_PETS_576_2013": {
        "id": "EURLEX_PETS_576_2013",
        "name": "Regulation (EU) No 576/2013 on the non-commercial movement of pet animals",
        "publisher": "European Parliament and Council of the European Union",
        "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0576",
        "jurisdiction": "EU",
        "publishedAt": "2013-06-12",
        "updatedAt": "2023-01-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official EU statute governing movement of dogs, cats, and ferrets across EU borders.",
        "textSummary": "Regulation (EU) No 576/2013 requires pet dogs, cats, and ferrets travelling between EU Member States to be marked with an ISO 11784/11785 compliant electronic microchip, have a valid anti-rabies vaccination administered at least 21 days prior to travel, and be accompanied by a standard European Pet Passport issued by an authorized veterinarian."
    },
    "AEROPORT_CRAIOVA_SECURITY": {
        "id": "AEROPORT_CRAIOVA_SECURITY",
        "name": "Regulament și controlul de securitate - Aeroportul Internațional Craiova (CRA)",
        "publisher": "Societatea Națională Aeroportul Internațional Craiova S.A.",
        "url": "https://aeroportcraiova.ro/controlul-de-securitate/",
        "jurisdiction": "RO",
        "publishedAt": "2023-05-10",
        "updatedAt": "2024-04-01",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "ro",
        "status": "verified",
        "statusReason": "Official operating authority and security protocol for Craiova International Airport (IATA: CRA).",
        "textSummary": "La punctul de control de securitate al Aeroportului Craiova, pasagerii sunt obligați să prezinte separat punga transparentă cu lichide (max 100 ml per recipient, max 1 litru total) și să scoată din bagajul de mână laptopurile, tabletele și echipamentele electronice mari, așezându-le în tăvi separate pentru scanare cu raze X."
    },
    "MAE_ROMANIA_DOCUMENTE": {
        "id": "MAE_ROMANIA_DOCUMENTE",
        "name": "Condiții de călătorie și documente necesare în străinătate",
        "publisher": "Ministerul Afacerilor Externe al României (MAE)",
        "url": "https://www.mae.ro/node/1422",
        "jurisdiction": "RO",
        "publishedAt": "2023-01-01",
        "updatedAt": "2026-03-15",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "ro",
        "status": "verified",
        "statusReason": "Official diplomatic and consular authority of Romania.",
        "textSummary": "Cetățenii români pot călători în statele membre ale Uniunii Europene și ale Spațiului Economic European pe baza cărții de identitate valabile. În cazul pierderii, furtului sau distrugerii documentelor de călătorie în străinătate, misiunile diplomatice și oficiile consulare ale României eliberează un titlu de călătorie provizoriu, valabil până la 30 de zile, strict pentru întoarcerea în România. O fotografie sau scanare pe telefon nu constituie document de călătorie."
    },
    "EU_EMERGENCY_112": {
        "id": "EU_EMERGENCY_112",
        "name": "112 - The European Single Emergency Number",
        "publisher": "European Commission (DG CNECT) & Serviciul de Telecomunicații Speciale (STS)",
        "url": "https://digital-strategy.ec.europa.eu/en/policies/112",
        "jurisdiction": "EU",
        "publishedAt": "2022-02-11",
        "updatedAt": "2026-02-11",
        "accessedAt": "2026-10-30T22:00:00Z",
        "lang": "mul",
        "status": "verified",
        "statusReason": "Official European Commission digital strategy policy on single emergency numbering across EU.",
        "textSummary": "112 is the single emergency telephone number available everywhere in the European Union, free of charge, from both fixed and mobile phones. Dialing 112 connects directly to emergency services (police, ambulance, fire service). Inside airport terminals, passengers facing urgent medical distress or imminent danger should immediately alert airport personnel or security staff and call 112."
    }
}

REJECTED_SOURCES = [
    {
        "url": "https://thepointsguy.com/guide/airline-passenger-rights/",
        "title": "A complete guide to EU passenger rights - The Points Guy",
        "publisher": "The Points Guy (Red Ventures)",
        "rejectionReason": "Commercial affiliate travel blog; contains secondary interpretations, promotional links, and non-authoritative claim summaries.",
        "category": "commercial_blog"
    },
    {
        "url": "https://www.airhelp.com/ro/drepturile-pasagerilor-aerieni/",
        "title": "Ghidul drepturilor pasagerilor - AirHelp",
        "publisher": "AirHelp Inc.",
        "rejectionReason": "For-profit claim agency; selective marketing presentation designed to solicit commercial claims, not primary statutory text.",
        "category": "commercial_claim_agency"
    },
    {
        "url": "https://www.reddit.com/r/travel/comments/schengen_customs/",
        "title": "Air Schengen Romania questions thread",
        "publisher": "Reddit User Community",
        "rejectionReason": "Crowdsourced social forum; unverified user anecdotes with high hallucination and misinformation rate.",
        "category": "social_forum"
    },
    {
        "url": "https://tripadvisor.com/ShowTopic-g294457-i1852-Baggage_Rules_Romania.html",
        "title": "Lost baggage Craiova advice - TripAdvisor Forum",
        "publisher": "TripAdvisor LLC",
        "rejectionReason": "Unofficial discussion forum with unvetted passenger posts and obsolete pre-Schengen advice.",
        "category": "social_forum"
    },
    {
        "url": "https://aviationfile.com/liquids-in-plane-cabin-restrictions/",
        "title": "Liquids restrictions in cabin - Aviation File SEO",
        "publisher": "Aviation File",
        "rejectionReason": "SEO-generated aggregation site without legal attribution or verifiable source date.",
        "category": "seo_aggregator"
    },
    {
        "url": "https://old-travel-blog-ro.com/ghid-granita-romania-2021/",
        "title": "Ghid control frontiera aeroport Romania 2021",
        "publisher": "Personal Travel Blog",
        "rejectionReason": "Obsolete historical post describing mandatory passport checkpoints superseded by 2024 Air Schengen accession.",
        "category": "obsolete_blog"
    }
]

def get_sources_dict():
    sources_out = {}
    for sid, s in OFFICIAL_SOURCES.items():
        sources_out[sid] = {
            "id": s["id"],
            "name": s["name"],
            "publisher": s["publisher"],
            "url": s["url"],
            "jurisdiction": s["jurisdiction"],
            "publishedAt": s["publishedAt"],
            "updatedAt": s["updatedAt"],
            "accessedAt": s["accessedAt"],
            "lang": s["lang"],
            "sha256": compute_sha256(s["textSummary"]),
            "status": s["status"],
            "statusReason": s["statusReason"]
        }
    return sources_out

def get_rejected_sources_list():
    return REJECTED_SOURCES
