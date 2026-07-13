import React, { useMemo, useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, Typography, Chip, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlightIcon from '@mui/icons-material/Flight';
import maplibregl from 'maplibre-gl';

import { useNavigation } from '../components/infrastructure/NavigationContext.js';
import { ViewKeys } from './viewKeys.js';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';
import { useAppStore } from '../store/useStore.js';

import type { INavigationElementProps } from '../navigation/navigationTypes.js';
import type { IStateVectorData, IAircraftTrack, IStateVector } from '../opensky/types.js';
import type { IOpenSkyAPIService } from '../services/openSkyAPIService.js';

type Props = INavigationElementProps;

function formatDate(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function getStatus(sv: IStateVector, muted: string): { label: string; color: string } {
  if (sv.on_ground) return { label: 'GND', color: '#6b7280' };
  const alt = sv.baro_altitude ?? sv.geo_altitude ?? 0;
  const spd = sv.velocity ?? 0;
  if (alt > 10 || spd > 5) return { label: 'FLY', color: '#d4a017' };
  return { label: 'IDLE', color: muted };
}

const FlightDetailsView: React.FC<Props> = (_props) => {
  const theme = useTheme();

  const MONO = '"Space Mono", "Courier New", monospace';
  const BG = theme.palette.background.default;
  const CARD_BG = theme.palette.background.paper;
  const BORDER = theme.palette.divider;
  const MUTED = theme.palette.text.secondary;
  const DARK = theme.palette.text.primary;
  const YELLOW = theme.palette.secondary.main;

  const { navigateByKey } = useNavigation();
  const appContext = useContext(AppContext);
  const openSkyAPIService = appContext.getService<IOpenSkyAPIService>(ServiceKeys.OpenSkyAPIService);
  const selectedTrackedIcao = useAppStore((s) => s.selectedTrackedIcao);
  const setSelectedTrackedIcao = useAppStore((s) => s.setSelectedTrackedIcao);
  const addRecentlyViewed = useAppStore((s) => s.addRecentlyViewed);

  const [trackData, setTrackData] = useState<IAircraftTrack | null>(null);
  const [stateVectors, setStateVectors] = useState<IStateVectorData>({ time: Date.now(), states: [] });
  const lastGoodDataRef = useRef<IStateVectorData>({ time: Date.now(), states: [] });
  const trackSubRef = useRef<string>('');
  const stateSubRef = useRef<string>('');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hasFlownToRef = useRef(false);
  const prevIcaoRef = useRef<string | null>(null);
  const openSkyRef = useRef(openSkyAPIService);
  openSkyRef.current = openSkyAPIService;

  const handleAircraftTrackUpdated = useCallback((data: IAircraftTrack) => {
    setTrackData(data);
  }, []);

  const handleStateVectorsUpdated = useCallback((data: IStateVectorData) => {
    if (data.states.length > 0) {
      setStateVectors(data);
      lastGoodDataRef.current = data;
    } else if (lastGoodDataRef.current.states.length > 0) {
      setStateVectors(lastGoodDataRef.current);
    }
  }, []);

  useEffect(() => {
    if (!openSkyRef.current) return;
    const key1 = openSkyRef.current.onAircraftTrackUpdated('FlightDetailsView', handleAircraftTrackUpdated);
    trackSubRef.current = key1;
    const key2 = openSkyRef.current.onStateVectorsUpdated('FlightDetailsView', handleStateVectorsUpdated);
    stateSubRef.current = key2;
    return () => {
      if (openSkyRef.current) {
        openSkyRef.current.offAircraftTrackUpdated(trackSubRef.current);
        openSkyRef.current.offStateVectorsUpdated(stateSubRef.current);
      }
    };
  }, [openSkyAPIService, handleAircraftTrackUpdated, handleStateVectorsUpdated]);

  useEffect(() => {
    hasFlownToRef.current = false;
    prevIcaoRef.current = null;
    if (selectedTrackedIcao && openSkyRef.current) {
      openSkyRef.current.trackAircraft(selectedTrackedIcao);
    }
    return () => {
      if (openSkyRef.current && selectedTrackedIcao) {
        openSkyRef.current.releaseTrack(selectedTrackedIcao);
      }
    };
  }, [selectedTrackedIcao]);

  useEffect(() => {
    if (!trackData || !trackData.stateVector) return;
    if (prevIcaoRef.current === trackData.icao24) return;
    prevIcaoRef.current = trackData.icao24;
    addRecentlyViewed(trackData);
  }, [trackData, addRecentlyViewed]);

  const vector = useMemo(() => {
    if (trackData?.stateVector) return trackData.stateVector;
    if (selectedTrackedIcao) {
      return stateVectors.states.find((s) => s.icao24 === selectedTrackedIcao) || null;
    }
    return null;
  }, [trackData, stateVectors, selectedTrackedIcao]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: theme.map.style,
        center: [0, 0],
        zoom: 4,
        attributionControl: false,
      });
      map.on('error', () => {});
      map.on('style.load', () => {
        try { map?.setProjection({ type: 'globe' }); } catch { /* projection not supported */ }
      });
      map.on('load', () => { mapLoadedRef.current = true; });
      mapRef.current = map;
    } catch (e) {
      console.error('Failed to initialize map:', e);
      if (map) { try { map.remove(); } catch { /* already removed */ } }
      mapRef.current = null;
      mapLoadedRef.current = false;
    }
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch { /* already removed */ }
        mapRef.current = null;
        mapLoadedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Map init runs once; style handled via style.load
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !vector) return;
    const map = mapRef.current;
    const lat = vector.latitude || 0;
    const lng = vector.longitude || 0;
    if (markerRef.current) markerRef.current.remove();
    const el = document.createElement('div');
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="transform:rotate(${vector.true_track || 0}deg)"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="${DARK}"/></svg>`;
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);
    if (!hasFlownToRef.current) {
      hasFlownToRef.current = true;
      map.flyTo({ center: [lng, lat], zoom: 6, duration: 3000, curve: 1.0, essential: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when vector changes
  }, [vector]);

  const handleBack = useCallback(() => {
    setSelectedTrackedIcao(null);
    navigateByKey(ViewKeys.FlightsTableView);
  }, [navigateByKey, setSelectedTrackedIcao]);

  if (!selectedTrackedIcao) {
    return (
      <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: BG, gap: 2 }}>
        <FlightIcon sx={{ fontSize: 48, color: YELLOW, opacity: 0.4 }} />
        <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED }}>No aircraft selected</Typography>
      </Box>
    );
  }

  const callsign = (vector?.callsign || '').trim() || selectedTrackedIcao.toUpperCase();
  const altM = vector?.baro_altitude || vector?.geo_altitude || 0;
  const altFt = altM ? Math.round(altM * 3.28084) : 0;
  const geoAltM = vector?.geo_altitude || 0;
  const geoAltFt = geoAltM ? Math.round(geoAltM * 3.28084) : 0;
  const baroAltM = vector?.baro_altitude || 0;
  const baroAltFt = baroAltM ? Math.round(baroAltM * 3.28084) : 0;
  const speedKts = vector?.velocity ? Math.round(vector.velocity * 1.94384) : 0;
  const heading = vector?.true_track ? Math.round(vector.true_track) : 0;
  const vRate = vector?.vertical_rate ? Math.round(vector.vertical_rate * 196.85) : 0;
  const status = vector ? getStatus(vector, MUTED) : { label: 'N/A', color: MUTED };
  const route = trackData?.route;
  const metadata = trackData?.metadata;

  const detailRowSx = {
    display: 'flex', justifyContent: 'space-between', py: 1, px: 2.5, borderBottom: `1px solid ${BORDER}`,
  };

  return (
    <Box sx={{ flex: 1, width: '100%', overflow: 'auto', backgroundColor: BG, minHeight: 0, scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <IconButton onClick={handleBack} size="small" sx={{ color: MUTED }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography sx={{ fontFamily: MONO, fontSize: { xs: '0.9rem', md: '1.1rem' }, fontWeight: 700, letterSpacing: '0.05em', color: DARK }}>
          {callsign}
        </Typography>
        <Chip label={status.label} size="small" sx={{
          height: 20, fontSize: '0.7rem', fontFamily: MONO, fontWeight: 700,
          backgroundColor: 'transparent', border: `1px solid ${status.color}`, color: status.color, borderRadius: 0,
          '& .MuiChip-label': { px: 1 },
        }} />
        <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED, ml: 'auto' }}>
          {selectedTrackedIcao.toUpperCase()}
        </Typography>
      </Box>

      <Box className="stagger-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box sx={{ border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
          <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Flight Information</Typography>
          </Box>
          {[
            { label: 'Callsign', value: callsign },
            { label: 'ICAO24', value: selectedTrackedIcao.toUpperCase() },
            { label: 'Origin Country', value: vector?.origin_country || 'Unknown' },
            { label: 'Squawk', value: vector?.squawk || '' },
            { label: 'Position Source', value: vector?.position_source !== undefined ? ['ADS-B', 'ASTERIX', 'MLAT', 'FLARM'][vector.position_source] || '' : '' },
            { label: 'Category', value: vector?.category !== undefined ? ['No info', 'No ADS-B', 'Light', 'Small', 'Large', 'High Vortex', 'Heavy', 'High Perf', 'Rotorcraft', 'Glider', 'LTA', 'Parachute', 'Ultralight', 'Reserved', 'UAV', 'Space'][vector.category] || '' : '' },
          ].map((row) => (
            <Box key={row.label} sx={detailRowSx}>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{row.label}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: DARK, fontWeight: 600 }}>{row.value}</Typography>
            </Box>
          ))}
          {metadata && (
            <>
              {[
                { label: 'Registration', value: metadata.registration || 'Not available' },
                { label: 'Operator', value: metadata.operator || 'Not available' },
                { label: 'Model', value: metadata.model || 'Not available' },
              ].map((row) => (
                <Box key={row.label} sx={detailRowSx}>
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{row.label}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: DARK, fontWeight: 600 }}>{row.value}</Typography>
                </Box>
              ))}
            </>
          )}
        </Box>

        <Box sx={{ border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
          <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Position & Performance</Typography>
          </Box>
          {[
            { label: 'Latitude', value: vector?.latitude?.toFixed(6) ?? '' },
            { label: 'Longitude', value: vector?.longitude?.toFixed(6) ?? '' },
            { label: 'Altitude (Baro)', value: baroAltFt > 0 ? `${baroAltFt.toLocaleString()} ft` : '' },
            { label: 'Altitude (Geo)', value: geoAltFt > 0 ? `${geoAltFt.toLocaleString()} ft` : '' },
            { label: 'Altitude (Best)', value: altFt > 0 ? `${altFt.toLocaleString()} ft` : 'GND' },
            { label: 'Velocity', value: speedKts > 0 ? `${speedKts} kts (${Math.round((vector?.velocity || 0) * 3.6)} km/h)` : '' },
            { label: 'True Track', value: heading > 0 ? `${heading}\u00B0` : '' },
            { label: 'Vertical Rate', value: vRate !== 0 ? `${vRate} ft/min` : '' },
            { label: 'On Ground', value: vector?.on_ground ? 'Yes' : 'No' },
            { label: 'Last Contact', value: formatDate(vector?.last_contact || null) },
            { label: 'Position Time', value: formatDate(vector?.time_position || null) },
          ].map((row) => (
            <Box key={row.label} sx={detailRowSx}>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{row.label}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: DARK, fontWeight: 600 }}>{row.value}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box className="fade-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Current Position</Typography>
        </Box>
        <Box sx={{ height: { xs: 240, md: 320 }, width: '100%', backgroundColor: theme.palette.background.default }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        </Box>
      </Box>

      <Box className="fade-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, mb: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
        <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${BORDER}` }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Route Information</Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2 }}>
          {route ? (
            <>
              {[
                { label: 'Est. Departure', value: route.estDepartureAirport || 'Not available' },
                { label: 'Est. Arrival', value: route.estArrivalAirport || 'Not available' },
                { label: 'Callsign', value: route.callsign || 'Not available' },
              ].map((row) => (
                <Box key={row.label} sx={detailRowSx}>
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{row.label}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: DARK, fontWeight: 600 }}>{row.value}</Typography>
                </Box>
              ))}
            </>
          ) : (
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED, textAlign: 'center', py: 2 }}>
              Historical route is unavailable from the current OpenSky endpoint.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default FlightDetailsView;
