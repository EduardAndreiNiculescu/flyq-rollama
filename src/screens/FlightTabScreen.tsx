import { useState } from 'react';
import { FlightScreen } from './FlightScreen';
import { JourneyScreen } from './JourneyScreen';

export function FlightTabScreen() {
  const [showFlightDetails, setShowFlightDetails] = useState(false);
  return showFlightDetails
    ? <FlightScreen onBackToJourney={() => setShowFlightDetails(false)} />
    : <JourneyScreen onShowFlightDetails={() => setShowFlightDetails(true)} />;
}
