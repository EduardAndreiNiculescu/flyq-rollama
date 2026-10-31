// Tipurile de domeniu folosite de ecrane, servicii și store.

export interface BoardingPass {
  raw: string;
  formatCode: string;
  legs: number;
  passengerName: string;
  electronicTicket: boolean;
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  flightNumber: string;
  /** Ziua din an (1–366), cum o codifică BCBP */
  julianDate: number;
  compartment: string;
  seat: string;
  sequence: string;
  passengerStatus: string;
}

export interface Airport {
  code: string;
  city: string;
  name: string;
  lat: number;
  lon: number;
  /** Decalajul față de UTC în minute, la data zborului */
  utcOffsetMin: number;
  schengen: boolean;
}

export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: 'city' | 'mountain' | 'region';
  fact: { ro: string; en: string };
}

export interface Flight {
  id: string;
  carrier: string;
  carrierName: string;
  flightNumber: string;
  from: string;
  to: string;
  /** Momente în UTC (ISO) */
  departureUtc: string;
  arrivalUtc: string;
  boardingUtc: string;
  gateCloseUtc: string;
  gate: string;
  gateFloor: number;
  aircraft: string;
  cruiseAltitudeM: number;
  cruiseSpeedKmh: number;
}

export interface Ticket {
  id: string;
  pass: BoardingPass;
  flightId: string;
  boardingGroup: number;
  checkedInOnline: boolean;
  hasCheckedBag: boolean;
  isDemo: boolean;
  addedAt: string;
}

// ───────── Terminal ─────────

export type NodeKind =
  | 'entrance'
  | 'junction'
  | 'checkin'
  | 'bagdrop'
  | 'security'
  | 'passport'
  | 'gate'
  | 'stairs'
  | 'lift'
  | 'toilet'
  | 'shop'
  | 'smoking'
  | 'power'
  | 'info';

export interface TerminalNode {
  id: string;
  x: number;
  y: number;
  floor: number;
  kind: NodeKind;
  /** Reper folosit în instrucțiuni („spre Securitate”) */
  landmark?: { ro: string; en: string };
}

export interface TerminalEdge {
  from: string;
  to: string;
  /** Securitatea și controlul pașapoartelor se traversează doar într-un sens */
  oneWay?: boolean;
  kind?: 'walk' | 'stairs' | 'lift';
}

export interface Zone {
  id: string;
  floor: number;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Înălțimea extrudării în metri; 0 = zonă plată pe podea */
  h: number;
  kind: 'security' | 'passport' | 'room' | 'desk' | 'shop' | 'area' | 'belt';
  label?: { ro: string; en: string };
}

export interface Floor {
  id: number;
  name: { ro: string; en: string };
  width: number;
  depth: number;
}

export interface Terminal {
  name: string;
  floors: Floor[];
  nodes: TerminalNode[];
  edges: TerminalEdge[];
  zones: Zone[];
}

export type PoiKind = 'toilet' | 'gate' | 'shop' | 'smoking' | 'power' | 'info' | 'stairs' | 'lift';

export interface Poi {
  id: string;
  kind: PoiKind;
  floor: number;
  x: number;
  y: number;
  nodeId: string;
  label: { ro: string; en: string };
}

export interface RoutePoint {
  x: number;
  y: number;
  floor: number;
  nodeId: string;
}

export interface Route {
  points: RoutePoint[];
  lengthM: number;
}

export type PositionStatus = 'walking' | 'still' | 'offRoute' | 'arrived';

export interface IndoorPosition {
  x: number;
  y: number;
  floor: number;
  /** Incertitudinea (1σ) în metri */
  sigma: number;
  status: PositionStatus;
  /** Distanța parcursă pe rută, în metri */
  progressM: number;
}

// ───────── Zbor ─────────

export interface FlightPosition {
  lat: number;
  lon: number;
  altitudeM: number;
  groundSpeedKmh: number;
  distanceRemainingKm: number;
  timeRemainingMin: number;
  progress: number;
  source: 'gps' | 'estimate';
  /** Precizia orizontală în metri */
  accuracyM: number;
  nearestLandmarkId?: string;
}

export interface FlightContext {
  flight: Flight;
  ticket: Ticket;
  position?: FlightPosition;
  nowUtc: string;
  language: 'ro' | 'en';
}
