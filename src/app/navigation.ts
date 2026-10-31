import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Map: { targetNodeId?: string } | undefined;
  Flight: undefined;
  Assistant: { question?: string } | undefined;
};

export type RootStackParamList = {
  AddTicket: undefined;
  Scan: undefined;
  Paste: { initialCode?: string } | undefined;
  FlightNumber: undefined;
  Pass: { ticketId: string; justAdded?: boolean };
  Live: undefined;
  LiveFlight: undefined;
  Profile: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
