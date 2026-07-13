import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography, IconButton, Chip, Divider, Tabs, Tab, LinearProgress, Tooltip, Snackbar, Alert } from '@mui/material';
import { getStatusText } from '../helpers/aircraftDataFunctions.js';
import { haversineDistance, formatDuration, formatDistance, formatSpeed, formatAltitude, getFlightPhase, getFlightStatusLabel, clamp } from '../helpers/mathFunctions.js';

// Types
import { type IAircraftTrack, type IFlightTimelineEvent, type IFlightStatistics, type IAircraftFlight } from '../opensky/types.js';
import { type IAirportData } from '../opensky/types.js';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import FlightIcon from '@mui/icons-material/Flight';
import TimelineIcon from '@mui/icons-material/Timeline';
import BarChartIcon from '@mui/icons-material/BarChart';
import InfoIcon from '@mui/icons-material/Info';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SpeedIcon from '@mui/icons-material/Speed';
import AltitudeIcon from '@mui/icons-material/Height';
import StraightenIcon from '@mui/icons-material/Straighten';
import AirlineSeatReclineNormalIcon from '@mui/icons-material/AirlineSeatReclineNormal';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import LinkIcon from '@mui/icons-material/Link';

interface ILocalProps {
  selectedAircraft?: IAircraftTrack;
  departureAirport?: IAirportData | null;
  arrivalAirport?: IAirportData | null;
  onRelease?: (icao24: string) => void;
}
type Props = ILocalProps;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index } = props;
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ overflow: 'auto', flex: 1 }}>
      {value === index && <Box sx={{ p: 1.5 }}>{children}</Box>}
    </Box>
  );
};

const AircraftInfoOverlay: React.FC<Props> = (props) => {

  const [lastPositionPastSeconds, setLastPositionPastSeconds] = useState(0);
  const [flightDetails, setFlightDetails] = useState<IAircraftFlight | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [altitudeHistory, setAltitudeHistory] = useState<Array<{ time: number; altitude: number; speed: number }>>([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const updateIntervalIDRef = useRef(0);
  const lastPositionPastSecondsRef = useRef(lastPositionPastSeconds);
  lastPositionPastSecondsRef.current = lastPositionPastSeconds;

  useEffect(() => {
    return () => {
      clearTimeout(updateIntervalIDRef.current);
    }
  }, []);

  useEffect(() => {
    if (!props.selectedAircraft || !props.selectedAircraft.stateVector) {
      clearTimeout(updateIntervalIDRef.current);
      return;
    }

    clearTimeout(updateIntervalIDRef.current);
    const lastPositionSeconds = props.selectedAircraft.stateVector.time_position
      ? props.selectedAircraft.stateVector.time_position
      : Math.floor(Date.now() / 1000);
    setLastPositionPastSeconds(Math.floor(Date.now() / 1000) - lastPositionSeconds);
    updateIntervalIDRef.current = window.setTimeout(() => {
      setLastPositionPastSeconds(prev => prev + 1);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Timer only needs time_position to update
  }, [props.selectedAircraft?.stateVector?.time_position]);

  useEffect(() => {
    let cancelled = false;
    const fetchFlightDetails = async () => {
      if (!props.selectedAircraft?.icao24) {
        setFlightDetails(null);
        return;
      }

      try {
        const now = Math.floor(Date.now() / 1000);
        const begin = now - 86400;
        const url = `/oskyapi/flights/aircraft?icao24=${props.selectedAircraft.icao24}&begin=${begin}&end=${now}`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          if (Array.isArray(data) && data.length > 0) {
            const isAirborne = props.selectedAircraft.stateVector && !props.selectedAircraft.stateVector.on_ground;
            const currentTime = props.selectedAircraft.stateVector?.time_position || now;

            if (isAirborne) {
              const activeFlight = data.find((f: IAircraftFlight) =>
                f.firstSeen <= currentTime && (currentTime - f.lastSeen) < 600
              );
              setFlightDetails(activeFlight || data[data.length - 1]);
            } else {
              setFlightDetails(data[data.length - 1]);
            }
          }
        }
      } catch {
        // Flight details not critical
      }
    };

    fetchFlightDetails();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fetch only re-runs when icao24 changes
  }, [props.selectedAircraft?.icao24]);

  const sv = props.selectedAircraft?.stateVector;
  const route = props.selectedAircraft?.route;
  const meta = props.selectedAircraft?.metadata;

  const depAirport = props.departureAirport;
  const arrAirport = props.arrivalAirport;

  const depCode = route?.estDepartureAirport || '';
  const arrCode = route?.estArrivalAirport || '';
  const depTime = flightDetails?.firstSeen || null;
  const arrTime = flightDetails?.lastSeen || null;

  // Calculate progress
  const progress = useMemo(() => {
    if (depTime && arrTime && sv?.time_position != null) {
      const total = arrTime - depTime;
      const elapsed = sv.time_position - depTime;
      return total > 0 ? clamp((elapsed / total) * 100, 0, 100) : 0;
    }
    return 0;
  }, [depTime, arrTime, sv?.time_position]);

  // Calculate distances
  const distances = useMemo(() => {
    if (!depAirport || !arrAirport || !sv?.latitude || !sv?.longitude) {
      return { total: 0, traveled: 0, remaining: 0 };
    }
    const total = haversineDistance(depAirport.latitude, depAirport.longitude, arrAirport.latitude, arrAirport.longitude);
    const traveled = haversineDistance(depAirport.latitude, depAirport.longitude, sv.latitude, sv.longitude);
    const remaining = haversineDistance(sv.latitude, sv.longitude, arrAirport.latitude, arrAirport.longitude);
    return {
      total: Math.max(total, traveled + remaining),
      traveled: Math.min(traveled, total),
      remaining: Math.min(remaining, total)
    };
  }, [depAirport, arrAirport, sv?.latitude, sv?.longitude]);

  // Track altitude/speed history for charts
  useEffect(() => {
    if (sv?.baro_altitude != null && sv?.velocity != null) {
      setAltitudeHistory(prev => {
        const next = [...prev, {
          time: Date.now(),
          altitude: sv.baro_altitude || 0,
          speed: (sv.velocity || 0) * 3.6
        }];
        return next.slice(-30);
      });
    }
  }, [sv?.baro_altitude, sv?.velocity]);

  const handleShareUrl = useCallback(() => {
    const url = `${window.location.origin}?icao24=${sv?.icao24}`;
    navigator.clipboard.writeText(url).then(() => {
      setSnackbarMessage('Flight URL copied to clipboard!');
      setSnackbarOpen(true);
    }).catch(() => {
      setSnackbarMessage(`Copy this flight link: ${url}`);
      setSnackbarOpen(true);
    });
  }, [sv?.icao24]);

  const handleExportCsv = useCallback(() => {
    if (!sv) return;
    const rows = [
      ['Field', 'Value'],
      ['ICAO24', sv.icao24.toUpperCase()],
      ['Callsign', sv.callsign || ''],
      ['Origin Country', sv.origin_country],
      ['Latitude', sv.latitude?.toFixed(4) || ''],
      ['Longitude', sv.longitude?.toFixed(4) || ''],
      ['Altitude (m)', String(sv.baro_altitude || '')],
      ['Speed (m/s)', String(sv.velocity || '')],
      ['Heading', String(sv.true_track || '')],
      ['Vertical Rate', String(sv.vertical_rate || '')],
      ['Squawk', sv.squawk || ''],
      ['On Ground', String(sv.on_ground)],
      ['Departure', route?.estDepartureAirport || ''],
      ['Arrival', route?.estArrivalAirport || ''],
      ['Aircraft Model', meta?.model || ''],
      ['Registration', meta?.registration || ''],
      ['Operator', meta?.operator || ''],
      ['Distance Total (m)', String(distances.total)],
      ['Distance Traveled (m)', String(distances.traveled)],
      ['Progress (%)', String(Math.round(progress))],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flight-${sv.icao24}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sv, route, meta, distances, progress]);

  // Flight statistics
  const statistics = useMemo<IFlightStatistics>(() => {
    const duration = depTime && arrTime ? arrTime - depTime : (depTime ? Math.floor(Date.now() / 1000) - depTime : 0);
    const avgSpeed = distances.total > 0 && duration > 0 ? distances.total / duration : (sv?.velocity || 0);
    const maxAlt = sv?.baro_altitude || 0;
    return {
      flightDuration: duration,
      averageSpeed: avgSpeed,
      maxAltitude: maxAlt,
      totalDistance: distances.total,
      airline: meta?.operator || '',
      aircraftType: meta?.model || meta?.typecode || ''
    };
  }, [depTime, arrTime, distances.total, sv?.baro_altitude, sv?.velocity, meta?.operator, meta?.model, meta?.typecode]);

  // Flight timeline
  const timeline = useMemo<IFlightTimelineEvent[]>(() => {
    const now = Math.floor(Date.now() / 1000);
    const altitude = sv?.baro_altitude || 0;
    const verticalRate = sv?.vertical_rate || 0;
    const isOnGround = sv?.on_ground ?? true;
    const currentPhase = getFlightPhase(isOnGround, altitude, verticalRate, depTime, arrTime, now);

    return [
      { phase: 'scheduled', label: 'Scheduled Departure', time: depTime, completed: !!depTime, current: currentPhase === 'boarding' },
      { phase: 'boarding', label: 'Boarding', time: depTime ? depTime - 600 : undefined, completed: currentPhase !== 'boarding' && currentPhase !== 'scheduled', current: currentPhase === 'boarding' },
      { phase: 'departed', label: 'Departed', time: depTime, completed: !!depTime && now > (depTime + 60), current: currentPhase === 'climbing' },
      { phase: 'cruise', label: 'Cruising', time: undefined, completed: altitude > 10000 && verticalRate < 2, current: currentPhase === 'cruise' },
      { phase: 'descent', label: 'Descending', time: undefined, completed: false, current: currentPhase === 'descending' },
      { phase: 'arrival', label: 'Arrival', time: arrTime, completed: !!arrTime && now > arrTime, current: currentPhase === 'landed' },
    ];
  }, [sv?.baro_altitude, sv?.vertical_rate, sv?.on_ground, depTime, arrTime]);

  // Determine flight status
  const flightStatus = useMemo<{ label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default' }>(() => {
    if (!sv) return { label: 'Unknown', color: 'default' };
    const altitude = sv.baro_altitude || 0;
    const vr = sv.vertical_rate || 0;
    const phase = getFlightPhase(sv.on_ground, altitude, vr, depTime, arrTime, Math.floor(Date.now() / 1000));
    return getFlightStatusLabel(phase);
  }, [sv, depTime, arrTime]);

  const formatTime = (unixSeconds: number | null | undefined): string => {
    if (unixSeconds == null || unixSeconds === 0) return '--:--';
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDate = (unixSeconds: number | null | undefined): string => {
    if (unixSeconds == null || unixSeconds === 0) return '';
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

  return (
    <Box
      sx={{
        position: 'relative',
        width: 380,
        maxHeight: 'calc(100vh - 160px)',
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        opacity: 0.95,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>

      {/* Close + Share + Export buttons */}
      <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1, display: 'flex', gap: 0.25 }}>
        <Tooltip title="Copy flight link">
          <IconButton size="small" onClick={handleShareUrl} sx={{ p: 0.5 }}>
            <LinkIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export as CSV">
          <IconButton size="small" onClick={handleExportCsv} sx={{ p: 0.5 }}>
            <FileDownloadIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => {
            if (props.onRelease && sv)
              props.onRelease(sv.icao24);
          }}
          sx={{ p: 0.5 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Flight Header: Callsign + Aircraft Type */}
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
            {sv?.callsign || sv?.icao24?.toUpperCase() || ''}
          </Typography>
          <Chip
            label={flightStatus.label}
            size="small"
            color={flightStatus.color}
            sx={{ height: 20, fontSize: '0.8rem', fontWeight: 'bold' }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {sv?.origin_country || ''}
          </Typography>
          {meta?.model && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              · {meta.model}
            </Typography>
          )}
          {meta?.registration && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              · {meta.registration}
            </Typography>
          )}
        </Box>
      </Box>

      <Divider />

      {/* Route: Dep → Arr with progress */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ textAlign: 'left', flex: '0 0 auto' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
              {depAirport?.iata || depCode.slice(0, 3) || ''}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.9rem' }}>
              {depCode}
            </Typography>
          </Box>

          <Box sx={{ flex: 1, mx: 2, position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
            <Box sx={{
              position: 'absolute', top: '50%', left: 0, right: 0,
              height: 2, backgroundColor: 'action.disabled', transform: 'translateY(-50%)'
            }} />
            <Box sx={{
              position: 'absolute', top: '50%', left: 0,
              width: `${progress}%`, height: 2,
              backgroundColor: 'primary.main', transform: 'translateY(-50%)',
              transition: 'width 1s linear'
            }} />
            <Box sx={{
              position: 'absolute',
              left: `${progress}%`,
              transform: 'translateX(-50%)',
              transition: 'left 1s linear'
            }}>
              <FlightIcon sx={{ fontSize: 18, color: 'primary.main', transform: 'rotate(90deg)' }} />
            </Box>
          </Box>

          <Box sx={{ textAlign: 'right', flex: '0 0 auto' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
              {arrAirport?.iata || arrCode.slice(0, 3) || ''}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.9rem' }}>
              {arrCode}
            </Typography>
          </Box>
        </Box>

        {/* Times row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatDate(depTime)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatTime(depTime)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {distances.total > 0 ? formatDistance(distances.total) : ''}
            </Typography>
            {progress > 0 && (
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                {Math.round(progress)}%
              </Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {formatDate(arrTime)}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatTime(arrTime)}
            </Typography>
          </Box>
        </Box>

        {/* Progress bar */}
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            mt: 1, height: 4, borderRadius: 2,
            backgroundColor: 'action.disabled',
            '& .MuiLinearProgress-bar': { borderRadius: 2 }
          }}
        />
      </Box>

      <Divider />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: '0.85rem' }
        }}>
        <Tab icon={<InfoIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Details" />
        <Tab icon={<TimelineIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Timeline" />
        <Tab icon={<BarChartIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Stats" />
        <Tab icon={<AltitudeIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Chart" />
      </Tabs>

      {/* Tab: Details */}
      <TabPanel value={activeTab} index={0}>
        {sv && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AltitudeIcon sx={{ fontSize: 12 }} /> Altitude
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.baro_altitude ? `${Math.round(sv.baro_altitude)} m / ${Math.round(sv.baro_altitude * 3.28084)} ft` : sv.on_ground ? 'Ground' : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SpeedIcon sx={{ fontSize: 12 }} /> Speed
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.velocity ? `${Math.round(sv.velocity * 3.6)} km/h` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Heading</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.true_track ? `${Math.round(sv.true_track)}\u00B0` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Vertical Rate</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.vertical_rate ? `${Math.round(sv.vertical_rate)} m/s` : ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Squawk</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.squawk || ''}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>ICAO24</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {sv.icao24.toUpperCase()}
              </Typography>
            </Box>
            {meta?.registration && (
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Registration</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {meta.registration}
                </Typography>
              </Box>
            )}
            {meta?.operator && (
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Airline</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {meta.operator}
                </Typography>
              </Box>
            )}
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
        )}
      </TabPanel>

      {/* Tab: Timeline */}
      <TabPanel value={activeTab} index={1}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {timeline.map((event, _index) => (
            <Box
              key={event.phase}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 0.75,
                borderRadius: 1,
                backgroundColor: event.current ? 'primary.main' + '20' : 'transparent',
                border: event.current ? 1 : 0,
                borderColor: 'primary.main',
              }}>
              <Box sx={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: event.current ? 'primary.main' : event.completed ? 'success.main' : 'action.disabled',
                flexShrink: 0
              }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{
                  fontWeight: event.current ? 'bold' : 'normal',
                  color: event.current ? 'primary.main' : 'text.primary'
                }}>
                  {event.label}
                </Typography>
                {event.time && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {formatTime(event.time)}
                  </Typography>
                )}
              </Box>
              {event.current && (
                <Chip label="NOW" size="small" color="primary" sx={{ height: 18, fontSize: '0.9rem', fontWeight: 'bold' }} />
              )}
            </Box>
          ))}
        </Box>
      </TabPanel>

      {/* Tab: Stats */}
      <TabPanel value={activeTab} index={2}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Flight Duration</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.flightDuration > 0 ? formatDuration(statistics.flightDuration) : ''}
              </Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Average Speed</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.averageSpeed > 0 ? formatSpeed(statistics.averageSpeed) : ''}
              </Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AltitudeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Max Altitude</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.maxAltitude > 0 ? formatAltitude(statistics.maxAltitude) : ''}
              </Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StraightenIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Total Distance</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.totalDistance > 0 ? formatDistance(statistics.totalDistance) : ''}
              </Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AirlineSeatReclineNormalIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Airline</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.airline}
              </Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlightIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Aircraft Type</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {statistics.aircraftType}
              </Typography>
            </Box>
          </Box>
          {distances.traveled > 0 && distances.remaining > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Distance Traveled / Remaining</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {formatDistance(distances.traveled)} / {formatDistance(distances.remaining)}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </TabPanel>

      {/* Tab: Chart (Altitude Profile) */}
      <TabPanel value={activeTab} index={3}>
        <Box sx={{ width: '100%' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block', mb: 1 }}>
            ALTITUDE PROFILE
          </Typography>
          {altitudeHistory.length < 2 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                Collecting altitude data...
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Chart will update as position data is received
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: 120, position: 'relative' }}>
              {/* Simple SVG altitude chart */}
              <svg width="100%" height="100%" viewBox="0 0 320 100" preserveAspectRatio="none">
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map(y => (
                  <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#e0dcd4" strokeWidth="0.5" />
                ))}
                {/* Altitude area */}
                <defs>
                  <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4a017" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#d4a017" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {(() => {
                  const maxAlt = Math.max(...altitudeHistory.map(h => h.altitude), 1);
                  const points = altitudeHistory.map((h, i) => {
                    const x = (i / (altitudeHistory.length - 1)) * 320;
                    const y = 100 - (h.altitude / maxAlt) * 90;
                    return `${x},${y}`;
                  });
                  const areaPoints = `0,100 ${points.join(' ')} 320,100`;
                  return (
                    <>
                      <polygon points={areaPoints} fill="url(#altGrad)" />
                      <polyline points={points.join(' ')} fill="none" stroke="#d4a017" strokeWidth="2" />
                    </>
                  );
                })()}
                {/* Current position dot */}
                {altitudeHistory.length > 0 && (() => {
                  const maxAlt = Math.max(...altitudeHistory.map(h => h.altitude), 1);
                  const last = altitudeHistory[altitudeHistory.length - 1];
                  const x = 320;
                  const y = 100 - (last.altitude / maxAlt) * 90;
                  return <circle cx={x} cy={y} r="3" fill="#d4a017" />;
                })()}
              </svg>
              {/* Labels */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  {altitudeHistory.length > 0 ? `${Math.round(altitudeHistory[0].altitude)} m` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  Max: {Math.round(Math.max(...altitudeHistory.map(h => h.altitude)))} m
                </Typography>
              </Box>
            </Box>
          )}

          {/* Speed section */}
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block', mb: 1, mt: 1.5 }}>
            SPEED
          </Typography>
          {altitudeHistory.length < 2 ? (
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Collecting speed data...
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: 80, position: 'relative' }}>
              <svg width="100%" height="100%" viewBox="0 0 320 70" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1565c0" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#1565c0" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {[0, 25, 50].map(y => (
                  <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#e0dcd4" strokeWidth="0.5" />
                ))}
                {(() => {
                  const maxSpd = Math.max(...altitudeHistory.map(h => h.speed), 1);
                  const points = altitudeHistory.map((h, i) => {
                    const x = (i / (altitudeHistory.length - 1)) * 320;
                    const y = 70 - (h.speed / maxSpd) * 60;
                    return `${x},${y}`;
                  });
                  const areaPoints = `0,70 ${points.join(' ')} 320,70`;
                  return (
                    <>
                      <polygon points={areaPoints} fill="url(#speedGrad)" />
                      <polyline points={points.join(' ')} fill="none" stroke="#1565c0" strokeWidth="2" />
                    </>
                  );
                })()}
              </svg>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  {altitudeHistory.length > 0 ? `${Math.round(altitudeHistory[0].speed)} km/h` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                  Max: {Math.round(Math.max(...altitudeHistory.map(h => h.speed)))} km/h
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </TabPanel>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbarOpen(false)} severity="info" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AircraftInfoOverlay;
