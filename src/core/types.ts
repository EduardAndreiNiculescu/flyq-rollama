export type JourneyStage =
  | 'pre_airport'
  | 'check_in'
  | 'security'
  | 'airside'
  | 'boarding'
  | 'in_flight'
  | 'arrival';

/** Integration contract: supplied by the map/positioning module. */
export type PassengerContext = {
  flightNumber?: string;
  airportCode?: string;
  journeyStage?: JourneyStage;
  /** From the passenger's boarding pass, so "what is my seat?" is answered from data the app holds. */
  seat?: string;
  /** Local time boarding starts ("08:10"), from the ticket flight, so "when is boarding?" is answered from data the app holds. */
  boarding?: string;
  currentZone?: string;
  positionConfidence?: number;
  connectionAvailable: boolean;
};

export type FlightRecord = {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: string; // ISO 8601 with offset
  scheduledArrival: string; // ISO 8601 with offset
  gate: string | null;
  gateStatus: 'unconfirmed' | 'confirmed';
  /** 'demo' data is fictional and must be labelled as such. */
  dataSource: 'demo' | 'airport_feed' | 'user_entered' | 'airlabs';
  lastUpdated: string | null;
  /** Third-party estimates (e.g. AirLabs). Shown next to, never instead of, the schedule. */
  estimatedDeparture?: string | null;
  estimatedArrival?: string | null;
  departureDelayMin?: number | null;
  arrivalDelayMin?: number | null;
  /** Third-party flight status (AirLabs). Not an official statement; may contradict position data. */
  providerStatus?: 'scheduled' | 'en-route' | 'landed' | null;
};

export type KbEntry = {
  id: string;
  topic: string;
  lang: 'en' | 'ro';
  title: string;
  body: string;
  keywords: string[];
  source: {
    name: string;
    url: string;
    jurisdiction?: string;
    /** ISO date a human verified this text against the source; null = NOT yet verified. */
    verifiedOn: string | null;
  };
  mayBeOutdated: boolean;
};

export const INTENT_NAMES = [
  'GET_FLIGHT_DETAILS',
  'GET_FLIGHT_TIME_REMAINING',
  'LOOKUP_AIRPORT_PROCEDURE',
  'GET_BAGGAGE_GUIDANCE',
  'GET_TRAVEL_DOCUMENT_GUIDANCE',
  'OPEN_AIRPORT_MAP',
  'GET_DESTINATION_INFORMATION',
  'GENERAL_QUESTION',
] as const;
export type IntentName = (typeof INTENT_NAMES)[number];

export type Intent = {
  intent: IntentName;
  args: Record<string, string>;
};

/** `nodeId`: the map node of a place the catalogue already knows (src/core/places.ts); without it the map matches the destination text */
export type NavigationRequest = { destination: string; fromZone?: string; nodeId?: string; mapLabel?: string };
