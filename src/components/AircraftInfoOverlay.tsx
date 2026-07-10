/* eslint-disable react/react-in-jsx-scope -- Unaware of jsxImportSource */
/** @jsxImportSource @emotion/react */
import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, IconButton, Chip, Divider } from '@mui/material';
import { getFormattedValue, getRotation, getStatusText } from '../helpers/aircraftDataFunctions.js';

// Types
import { type IAircraftTrack, type IAircraftFlight } from '../opensky/types.js';

// Icons
import CloseIcon from '@mui/icons-material/Close';

interface ILocalProps {
  selectedAircraft?: IAircraftTrack;
  onRelease?: (icao24: string) => void;
}
type Props = ILocalProps;

const AircraftInfoOverlay: React.FC<Props> = (props) => {

  // States
  const [lastPositionPastSeconds, setLastPositionPastSeconds] = useState(0);
  const [flightDetails, setFlightDetails] = useState<IAircraftFlight | null>(null);

  // Refs
  const updateIntervalIDRef = useRef(0);
  const lastPositionPastSecondsRef = useRef(lastPositionPastSeconds);
  lastPositionPastSecondsRef.current = lastPositionPastSeconds;

  // Effects
  useEffect(() => {
    return () => {
      clearInterval(updateIntervalIDRef.current);
    }
  }, []);

  useEffect(() => {
    if (!props.selectedAircraft || !props.selectedAircraft.stateVector) {
      clearInterval(updateIntervalIDRef.current);
      return;
    }

    clearInterval(updateIntervalIDRef.current);
    const lastPositionSeconds = props.selectedAircraft.stateVector.time_position
      ? props.selectedAircraft.stateVector.time_position
      : Math.floor(Date.now() / 1000);
    setLastPositionPastSeconds(Math.floor(Date.now() / 1000) - lastPositionSeconds);
    updateIntervalIDRef.current = window.setInterval(() => {
      setLastPositionPastSeconds(prev => prev + 1);
    }, 1000);
  }, [props.selectedAircraft?.stateVector]);

  // Fetch flight details (departure/arrival times)
  useEffect(() => {
    const fetchFlightDetails = async () => {
      if (!props.selectedAircraft?.icao24) {
        setFlightDetails(null);
        return;
      }

      try {
        const now = Math.floor(Date.now() / 1000);
        const begin = now - 86400; // last 24 hours
        const url = `/oskyapi/flights/aircraft?icao24=${props.selectedAircraft.icao24}&begin=${begin}&end=${now}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const isAirborne = props.selectedAircraft.stateVector && !props.selectedAircraft.stateVector.on_ground;
            const currentTime = props.selectedAircraft.stateVector?.time_position || now;

            if (isAirborne) {
              // Find the in-progress flight: most recent firstSeen where lastSeen is recent (within 600s of current position)
              const activeFlight = data.find((f: IAircraftFlight) =>
                f.firstSeen <= currentTime && (currentTime - f.lastSeen) < 600
              );
              setFlightDetails(activeFlight || data[data.length - 1]);
            } else {
              // On ground: pick the most recently completed flight
              setFlightDetails(data[data.length - 1]);
            }
          }
        }
      } catch {
        // Flight details not critical
      }
    };

    fetchFlightDetails();
  }, [props.selectedAircraft?.icao24]);

  const formatTime = (unixSeconds: number | null): string => {
    if (!unixSeconds) return '--:--';
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDate = (unixSeconds: number | null): string => {
    if (!unixSeconds) return '';
    const date = new Date(unixSeconds * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (!props.selectedAircraft)
    return null;

  const sv = props.selectedAircraft.stateVector;
  const route = props.selectedAircraft.route;
  const meta = props.selectedAircraft.metadata;

  const depCode = route?.estDepartureAirport || '---';
  const arrCode = route?.estArrivalAirport || '---';
  const depTime = flightDetails?.firstSeen || null;
  const arrTime = flightDetails?.lastSeen || null;

  // Calculate progress
  let progress = 0;
  if (depTime && arrTime && sv?.time_position) {
    const total = arrTime - depTime;
    const elapsed = sv.time_position - depTime;
    progress = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: 360,
        maxHeight: 'calc(100vh - 160px)',
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 5,
        opacity: 0.95,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>

      {/* Close button */}
      <IconButton
        size="small"
        onClick={() => {
          if (props.onRelease && sv)
            props.onRelease(sv.icao24);
        }}
        sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
        <CloseIcon fontSize="small" />
      </IconButton>

      {/* Flight Header: Callsign + Aircraft Type */}
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
            {sv?.callsign || '---'}
          </Typography>
          {meta?.model && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {meta.model}
            </Typography>
          )}
          {meta?.operator && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {meta.operator}
            </Typography>
          )}
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {sv?.origin_country || ''}
          {sv?.icao24 ? ` · ${sv.icao24.toUpperCase()}` : ''}
        </Typography>
      </Box>

      <Divider />

      {/* Route: Dep → Arr with plane */}
      <Box sx={{ px: 2, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Departure */}
          <Box sx={{ textAlign: 'left', flex: '0 0 auto' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
              {depCode}
            </Typography>
          </Box>

          {/* Route line */}
          <Box sx={{ flex: 1, mx: 2, position: 'relative', height: 24 }}>
            {/* Line background */}
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: 'action.disabled',
              transform: 'translateY(-50%)'
            }} />
            {/* Progress line */}
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: `${progress}%`,
              height: 2,
              backgroundColor: 'primary.main',
              transform: 'translateY(-50%)'
            }} />
          </Box>

          {/* Arrival */}
          <Box sx={{ textAlign: 'right', flex: '0 0 auto' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
              {arrCode}
            </Typography>
          </Box>
        </Box>

        {/* Times row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          {/* Departure time */}
          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatDate(depTime)}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              {formatTime(depTime)}
            </Typography>
          </Box>

          {/* Status */}
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {sv?.on_ground ? (
              <Chip label="On Ground" size="small" color="warning" sx={{ height: 20, fontSize: '0.7rem' }} />
            ) : (
              <Chip label="In Flight" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />
            )}
          </Box>

          {/* Arrival time */}
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatDate(arrTime)}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
              {formatTime(arrTime)}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Flight Data */}
      {sv && (
        <Box sx={{ px: 2, py: 1, overflow: 'auto', flex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Altitude</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.baro_altitude ? `${Math.round(sv.baro_altitude)} m / ${Math.round(sv.baro_altitude * 3.28084)} ft` : sv.on_ground ? 'Ground' : '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Speed</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.velocity ? `${Math.round(sv.velocity * 3.6)} km/h` : '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Position</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.latitude && sv.longitude
                  ? `${sv.latitude.toFixed(4)}°, ${sv.longitude.toFixed(4)}°`
                  : '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Heading</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.true_track ? `${Math.round(sv.true_track)}°` : '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Vertical Rate</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.vertical_rate ? `${Math.round(sv.vertical_rate)} m/s` : '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Squawk</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.squawk || '---'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Last Contact</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {lastPositionPastSeconds}s ago
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Status</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {getStatusText(sv.on_ground, sv.vertical_rate || 0, sv.baro_altitude || 0)}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default AircraftInfoOverlay;
