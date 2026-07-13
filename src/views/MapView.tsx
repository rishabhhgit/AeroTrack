import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from './../services/serviceKeys.js';
import { ViewKeys } from './viewKeys.js';
import FlightMap from './../components/FlightMap.js';
import type { ViewState } from './../components/FlightMap.js';

// Types
import type { INavigationElementProps } from '../navigation/navigationTypes.js';
import type { IOpenSkyAPIService } from './../services/openSkyAPIService.js';
import type { IStateVectorData, IAircraftTrack, IMapGeoBounds, IAirportData } from './../opensky/types.js';
import type { IAirportService } from '../services/airportService.js';

type Props = Record<string, never> & INavigationElementProps;

const MapView: React.FC<Props> = (_props) => {

  const [stateVectors, setStateVectors] = useState<IStateVectorData>({ time: Date.now(), states: [] });
  const [trackedAircraft, setTrackedAircraft] = useState<IAircraftTrack | undefined>(undefined);
  const [departureAirport, setDepartureAirport] = useState<IAirportData | null>(null);
  const [arrivalAirport, setArrivalAirport] = useState<IAirportData | null>(null);

  const lastGoodDataRef = useRef<IStateVectorData>({ time: Date.now(), states: [] });
  const appContext = useContext(AppContext)
  const openSkyAPIService = appContext.getService<IOpenSkyAPIService>(ServiceKeys.OpenSkyAPIService);
  const airportService = appContext.getService<IAirportService>(ServiceKeys.AirportService);

  const stateVectorsSubscriptionRef = useRef<string>('');
  const aircraftTrackSubscriptionRef = useRef<string>('');
  const openSkyRef = useRef(openSkyAPIService);
  openSkyRef.current = openSkyAPIService;
  const airportServiceRef = useRef(airportService);
  airportServiceRef.current = airportService;

  useEffect(() => {
    if (openSkyRef.current) {
      const registerKey1 = openSkyRef.current.onStateVectorsUpdated(ViewKeys.MapView, handleStateVectorsUpdated);
      stateVectorsSubscriptionRef.current = registerKey1;

      const registerKey2 = openSkyRef.current.onAircraftTrackUpdated(ViewKeys.MapView, handleAircraftTrackUpdated);
      aircraftTrackSubscriptionRef.current = registerKey2;

      // Auto-track from URL parameter (?icao24=xxx)
      const params = new URLSearchParams(window.location.search);
      const icao24 = params.get('icao24');
      if (icao24 && openSkyRef.current) {
        openSkyRef.current.trackAircraft(icao24);
      }
    }

    return () => {
      if (openSkyRef.current) {
        openSkyRef.current.offStateVectorsUpdated(stateVectorsSubscriptionRef.current);
        openSkyRef.current.offAircraftTrackUpdated(aircraftTrackSubscriptionRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Callbacks are stable via useCallback; effect runs on service change only
  }, [openSkyAPIService]);

  const handleStateVectorsUpdated = useCallback((data: IStateVectorData) => {
    if (data.states.length > 0) {
      setStateVectors(data);
      lastGoodDataRef.current = data;
    } else if (lastGoodDataRef.current.states.length > 0) {
      setStateVectors(lastGoodDataRef.current);
    }
  }, []);

  const handleAircraftTrackUpdated = useCallback((data: IAircraftTrack) => {
    setTrackedAircraft(data);

    if (airportServiceRef.current && data.route) {
      const depIcao = data.route.estDepartureAirport;
      const arrIcao = data.route.estArrivalAirport;
      setDepartureAirport(depIcao ? airportServiceRef.current.getAirport(depIcao) || null : null);
      setArrivalAirport(arrIcao ? airportServiceRef.current.getAirport(arrIcao) || null : null);
    }
  }, []);

  const handleMapChange = useCallback((_viewState: ViewState, geoBounds: IMapGeoBounds) => {
    if (openSkyRef.current)
      openSkyRef.current.geoBounds = geoBounds;
  }, []);

  const handleTrackAircraft = useCallback((icao24: string) => {
    if (openSkyRef.current)
      openSkyRef.current.trackAircraft(icao24);
    setTrackedAircraft(undefined);
    setDepartureAirport(null);
    setArrivalAirport(null);
  }, []);

  const handleReleaseTrack = useCallback((icao24: string) => {
    if (openSkyRef.current)
      openSkyRef.current.releaseTrack(icao24);
    setTrackedAircraft(undefined);
    setDepartureAirport(null);
    setArrivalAirport(null);
  }, []);

  return (

    <Box
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>

      <FlightMap
        stateVectors={stateVectors}
        selectedAircraft={trackedAircraft}
        departureAirport={departureAirport}
        arrivalAirport={arrivalAirport}
        onMapChange={handleMapChange}
        onTrackAircraft={handleTrackAircraft}
        onReleaseTrack={handleReleaseTrack} />
    </Box>
  );
}

export default MapView;
