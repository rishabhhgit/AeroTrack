import React, { useMemo, useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box, Typography, Chip, TextField, InputAdornment, Select, MenuItem, FormControl,
  Slider, useMediaQuery, Tooltip, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FlightIcon from '@mui/icons-material/Flight';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';
import { useNavigation } from '../components/infrastructure/NavigationContext.js';
import { ViewKeys } from './viewKeys.js';
import { useAppStore } from '../store/useStore.js';

import type { INavigationElementProps } from '../navigation/navigationTypes.js';
import type { IStateVectorData, IStateVector } from '../opensky/types.js';
import type { IOpenSkyAPIService } from '../services/openSkyAPIService.js';

type Props = INavigationElementProps;

function formatTime(ts: number | null): string {
  if (!ts || ts <= 0) return '';
  try {
    const d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function formatCoord(val: number | null, isLat: boolean): string {
  if (val == null || isNaN(val)) return '';
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(4)}\u00B0${dir}`;
}

function getHeadingLabel(deg: number | null): string {
  if (deg == null || isNaN(deg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return `${Math.round(deg)}\u00B0 ${dirs[idx]}`;
}

function getStatus(sv: IStateVector): { label: string; color: string; bg: string } {
  if (sv.on_ground) return { label: 'GND', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
  const alt = sv.baro_altitude ?? sv.geo_altitude ?? 0;
  const spd = sv.velocity ?? 0;
  if (alt > 10 || spd > 5) return { label: 'FLY', color: '#d4a017', bg: 'rgba(212,160,23,0.08)' };
  return { label: 'IDLE', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' };
}

interface RouteInfo {
  departureAirport: string | null;
  arrivalAirport: string | null;
}

const ROW_HEIGHT = 42;
const VISIBLE_ROWS = 35;

const FlightsTableView: React.FC<Props> = (_props) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isMd = useMediaQuery(theme.breakpoints.down('md'));

  const MONO = '"Space Mono", "Courier New", monospace';
  const BG = theme.palette.background.default;
  const CARD_BG = theme.palette.background.paper;
  const BORDER = theme.palette.divider;
  const MUTED = theme.palette.text.secondary;
  const DARK = theme.palette.text.primary;
  const HOVER = theme.palette.action.hover;
  const ACCENT = theme.palette.secondary?.main || '#d4a017';

  const appContext = useContext(AppContext);
  const openSkyAPIService = appContext.getService<IOpenSkyAPIService>(ServiceKeys.OpenSkyAPIService);
  const { navigateByKey } = useNavigation();
  const setSelectedTrackedIcao = useAppStore((s) => s.setSelectedTrackedIcao);

  const [stateVectors, setStateVectors] = useState<IStateVectorData>({ time: Date.now(), states: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [altRange, setAltRange] = useState<number[]>([0, 50000]);
  const [speedRange, setSpeedRange] = useState<number[]>([0, 600]);
  const [altRangeCommitted, setAltRangeCommitted] = useState<number[]>([0, 50000]);
  const [speedRangeCommitted, setSpeedRangeCommitted] = useState<number[]>([0, 600]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  const lastGoodDataRef = useRef<IStateVectorData>({ time: Date.now(), states: [] });
  const subscriptionRef = useRef<string>('');
  const routeCacheRef = useRef<Map<string, RouteInfo>>(new Map());
  const routeFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const openSkyRef = useRef(openSkyAPIService);
  openSkyRef.current = openSkyAPIService;

  const handleStateVectorsUpdated = useCallback((data: IStateVectorData) => {
    setInitialLoad(false);
    if (data.states.length > 0) {
      setStateVectors(data);
      lastGoodDataRef.current = data;
    } else if (lastGoodDataRef.current.states.length > 0) {
      setStateVectors(lastGoodDataRef.current);
    }
  }, []);

  useEffect(() => {
    if (!openSkyRef.current) return;
    try {
      openSkyRef.current.geoBounds = {
        southernLatitude: -85,
        northernLatitude: 85,
        westernLongitude: -180,
        easternLongitude: 180,
      };
      subscriptionRef.current = openSkyRef.current.onStateVectorsUpdated('FlightsTableView', handleStateVectorsUpdated);
    } catch (e) {
      console.error('Failed to subscribe to state vectors:', e);
      setApiError(true);
    }
    return () => {
      if (subscriptionRef.current && openSkyRef.current) {
        openSkyRef.current.offStateVectorsUpdated(subscriptionRef.current);
      }
    };
  }, [openSkyAPIService, handleStateVectorsUpdated]);

  useEffect(() => {
    const timer = window.setTimeout(() => setInitialLoad(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const flights = useMemo(() => {
    if (!stateVectors?.states) return [];
    return stateVectors.states.filter(
      (s) => s && s.latitude != null && s.longitude != null
    );
  }, [stateVectors]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const s of flights) {
      if (s.origin_country) set.add(s.origin_country);
    }
    return Array.from(set).sort();
  }, [flights]);

  const filtered = useMemo(() => {
    return flights.filter((sv) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toUpperCase().trim();
        const callsign = (sv.callsign || '').toUpperCase();
        const icao = sv.icao24.toUpperCase();
        const country = (sv.origin_country || '').toUpperCase();
        if (!callsign.includes(q) && !icao.includes(q) && !country.includes(q)) return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'flying' && sv.on_ground) return false;
        if (statusFilter === 'grounded' && !sv.on_ground) return false;
      }
      if (countryFilter !== 'all' && sv.origin_country !== countryFilter) return false;
      const altFt = (sv.baro_altitude ?? sv.geo_altitude ?? 0) * 3.28084;
      if (altFt < altRangeCommitted[0] || altFt > altRangeCommitted[1]) return false;
      const speedKts = (sv.velocity ?? 0) * 1.94384;
      if (speedKts < speedRangeCommitted[0] || speedKts > speedRangeCommitted[1]) return false;
      return true;
    });
  }, [flights, searchQuery, statusFilter, countryFilter, altRangeCommitted, speedRangeCommitted]);

  useEffect(() => {
    if (filtered.length === 0 || !openSkyAPIService) return;
    if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);

    routeFetchTimerRef.current = setTimeout(() => {
      const toFetch = filtered
        .filter(
          (sv) =>
            sv.callsign &&
            sv.callsign.trim().length > 0 &&
            !routeCacheRef.current.has(sv.icao24)
        )
        .slice(0, 3);

      if (toFetch.length === 0) return;

      let cancelled = false;
      const service = openSkyAPIService;

      const fetchRoutes = async () => {
        for (const sv of toFetch) {
          if (cancelled) break;
          try {
            const result = await service.fetchRoute(sv.icao24, sv);
            if (cancelled) break;
            if (result) {
              routeCacheRef.current.set(sv.icao24, {
                departureAirport: result.departureAirport,
                arrivalAirport: result.arrivalAirport,
              });
            }
          } catch {
            // Route fetch failed silently
          }
          if (!cancelled) await new Promise((r) => setTimeout(r, 2000));
        }
      };

      fetchRoutes();

      return () => {
        cancelled = true;
      };
    }, 3000);

    return () => {
      if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);
    };
  }, [filtered, openSkyAPIService]);

  const handleFlightClick = useCallback(
    (icao24: string) => {
      if (!icao24) return;
      setSelectedTrackedIcao(icao24);
      navigateByKey(ViewKeys.FlightDetailsView);
    },
    [navigateByKey, setSelectedTrackedIcao]
  );

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop);
    }
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
  const endIdx = Math.min(filtered.length, startIdx + VISIBLE_ROWS + 10);
  const visibleRows = filtered.slice(startIdx, endIdx);

  const headerCellSx = {
    fontFamily: MONO,
    fontSize: '0.65rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    color: MUTED,
    py: 0,
    px: 1,
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
    flexShrink: 0,
    lineHeight: '40px',
  };

  const cellSx = {
    fontFamily: MONO,
    fontSize: '0.8rem',
    py: 0,
    px: 1,
    color: DARK,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 0,
    lineHeight: `${ROW_HEIGHT}px`,
    height: ROW_HEIGHT,
  };

  const renderRow = (sv: IStateVector, index: number) => {
    const callsign = (sv.callsign || '').trim();
    const altFt = sv.baro_altitude != null ? Math.round(sv.baro_altitude * 3.28084) : null;
    const geoAltFt = sv.geo_altitude != null ? Math.round(sv.geo_altitude * 3.28084) : null;
    const speedKts = sv.velocity != null ? Math.round(sv.velocity * 1.94384) : null;
    const heading = sv.true_track != null ? Math.round(sv.true_track) : null;
    const vRateFpm = sv.vertical_rate != null ? Math.round(sv.vertical_rate * 196.85) : null;
    const status = getStatus(sv);
    const route = routeCacheRef.current.get(sv.icao24);

    let altDisplay: string;
    if (sv.on_ground) {
      altDisplay = 'GND';
    } else if (altFt != null && altFt > 0) {
      altDisplay = altFt.toLocaleString();
    } else if (geoAltFt != null && geoAltFt > 0) {
      altDisplay = geoAltFt.toLocaleString();
    } else {
      altDisplay = '';
    }

    let routeParts: string[] = [];
    let routeColor = MUTED;
    let routeWeight: number = 400;
    if (route?.departureAirport && route?.arrivalAirport) {
      routeParts = [route.departureAirport, route.arrivalAirport];
      routeColor = DARK;
      routeWeight = 600;
    } else if (route?.departureAirport) {
      routeParts = [route.departureAirport];
      routeColor = MUTED;
      routeWeight = 600;
    } else if (route?.arrivalAirport) {
      routeParts = [route.arrivalAirport];
      routeColor = MUTED;
      routeWeight = 600;
    }

    return (
      <Box
        key={`flight-${sv.icao24}-${startIdx + index}`}
        onClick={() => handleFlightClick(sv.icao24)}
        className="table-row"
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: ROW_HEIGHT,
          borderBottom: `1px solid ${BORDER}`,
          backgroundColor: index % 2 === 0 ? CARD_BG : 'transparent',
          cursor: 'pointer',
          '&:hover': { backgroundColor: HOVER },
          transition: 'background-color 0.12s ease',
        }}
      >
        <Tooltip title={callsign || sv.icao24.toUpperCase()} placement="top" arrow>
          <Typography sx={{ ...cellSx, width: isMobile ? 72 : 100, fontWeight: 700, color: DARK }}>
            {callsign || '\u2014'}
          </Typography>
        </Tooltip>
        <Tooltip title={sv.icao24.toUpperCase()} placement="top" arrow>
          <Typography sx={{ ...cellSx, width: isMobile ? 64 : 82, fontSize: '0.75rem', color: MUTED }}>
            {sv.icao24.toUpperCase()}
          </Typography>
        </Tooltip>
        {!isMobile && (
          <Tooltip title={sv.origin_country || ''} placement="top" arrow>
            <Typography sx={{ ...cellSx, width: isMd ? 90 : 120, fontSize: '0.75rem', color: MUTED }}>
              {sv.origin_country || ''}
            </Typography>
          </Tooltip>
        )}
        {!isMobile && (
          <Tooltip
            title={routeParts.length === 2 ? `${routeParts[0]} \u2192 ${routeParts[1]}` : routeParts[0] || ''}
            placement="top"
            arrow
          >
            <Typography
              sx={{
                ...cellSx,
                width: isMd ? 100 : 140,
                fontSize: '0.75rem',
                color: routeColor,
                fontWeight: routeWeight,
              }}
            >
              {routeParts.length === 2
                ? `${routeParts[0]} \u2192 ${routeParts[1]}`
                : routeParts[0] || ''}
            </Typography>
          </Tooltip>
        )}
        {!isMobile && (
          <Typography sx={{ ...cellSx, width: isMd ? 85 : 100, fontSize: '0.75rem', color: MUTED, textAlign: 'right' }}>
            {formatCoord(sv.latitude, true)}
          </Typography>
        )}
        {!isMobile && (
          <Typography sx={{ ...cellSx, width: isMd ? 85 : 100, fontSize: '0.75rem', color: MUTED, textAlign: 'right' }}>
            {formatCoord(sv.longitude, false)}
          </Typography>
        )}
        <Typography
          sx={{
            ...cellSx,
            width: isMobile ? 60 : 80,
            textAlign: 'right',
            color: sv.on_ground ? MUTED : DARK,
            fontWeight: sv.on_ground ? 400 : 600,
          }}
        >
          {altDisplay}
        </Typography>
        <Typography
          sx={{
            ...cellSx,
            width: isMobile ? 55 : 70,
            textAlign: 'right',
            color: speedKts != null && speedKts > 0 ? DARK : MUTED,
            fontWeight: speedKts != null && speedKts > 0 ? 600 : 400,
          }}
        >
          {speedKts != null && speedKts > 0 ? speedKts : ''}
        </Typography>
        {!isMobile && (
          <Typography sx={{ ...cellSx, width: isMd ? 60 : 75, textAlign: 'right', color: MUTED, fontSize: '0.75rem' }}>
            {getHeadingLabel(heading)}
          </Typography>
        )}
        {!isMobile && (
          <Typography
            sx={{
              ...cellSx,
              width: isMd ? 65 : 80,
              textAlign: 'right',
              color: vRateFpm != null && vRateFpm !== 0 ? DARK : MUTED,
              fontWeight: vRateFpm != null && vRateFpm !== 0 ? 600 : 400,
            }}
          >
            {vRateFpm != null && vRateFpm !== 0
              ? `${vRateFpm > 0 ? '+' : ''}${vRateFpm}`
              : ''}
          </Typography>
        )}
        <Box sx={{ ...cellSx, width: isMobile ? 44 : 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Chip
            label={status.label}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              fontFamily: MONO,
              fontWeight: 700,
              backgroundColor: status.bg,
              border: `1px solid ${status.color}33`,
              color: status.color,
              borderRadius: '3px',
              '& .MuiChip-label': { px: 0.75, py: 0 },
              minWidth: 36,
            }}
          />
        </Box>
        {!isMobile && (
          <Tooltip
            title={sv.last_contact ? new Date(sv.last_contact * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
            placement="top"
            arrow
          >
            <Typography sx={{ ...cellSx, flex: 1, minWidth: 70, fontSize: '0.75rem', color: MUTED }}>
              {formatTime(sv.last_contact)}
            </Typography>
          </Tooltip>
        )}
      </Box>
    );
  };

  const isLoading = initialLoad && flights.length === 0;
  const isEmpty = !initialLoad && flights.length === 0;
  const noResults = !initialLoad && flights.length > 0 && filtered.length === 0;

  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        overflow: 'hidden',
        backgroundColor: BG,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          pt: { xs: 2, md: 2.5 },
          pb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          backgroundColor: CARD_BG,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
          <Typography
            sx={{
              fontFamily: MONO,
              fontSize: { xs: '0.95rem', md: '1.1rem' },
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: DARK,
            }}
          >
            Flights
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.8rem', color: MUTED }}>
            {filtered.length.toLocaleString()} / {flights.length.toLocaleString()}
          </Typography>
          {flights.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 2s infinite' }} />
              <Typography sx={{ fontFamily: MONO, fontSize: '0.7rem', color: '#22c55e', fontWeight: 700, letterSpacing: '0.08em' }}>
                LIVE
              </Typography>
            </Box>
          )}
        </Box>
        <TextField
          size="small"
          placeholder={isMobile ? 'Search...' : 'Search callsign, ICAO24, country...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: MUTED }} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: { xs: 150, sm: 240 },
            '& .MuiOutlinedInput-root': {
              fontFamily: MONO,
              fontSize: '0.8rem',
              backgroundColor: BG,
              borderRadius: '4px',
              height: 32,
            },
          }}
        />
      </Box>

      {/* Filters */}
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          py: 1.5,
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: CARD_BG,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: MUTED }}>
          <FilterListIcon sx={{ fontSize: 14 }} />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
            Filters
          </Typography>
        </Box>


        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{
              fontFamily: MONO,
              fontSize: '0.8rem',
              borderRadius: '4px',
              backgroundColor: BG,
              height: 32,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
            }}
          >
            <MenuItem value="all" sx={{ fontFamily: MONO, fontSize: '0.8rem' }}>All Status</MenuItem>
            <MenuItem value="flying" sx={{ fontFamily: MONO, fontSize: '0.8rem' }}>Flying</MenuItem>
            <MenuItem value="grounded" sx={{ fontFamily: MONO, fontSize: '0.8rem' }}>Grounded</MenuItem>
          </Select>
        </FormControl>

        {!isMobile && (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              sx={{
                fontFamily: MONO,
                fontSize: '0.8rem',
                borderRadius: '4px',
                backgroundColor: BG,
                height: 32,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
              }}
            >
              <MenuItem value="all" sx={{ fontFamily: MONO, fontSize: '0.8rem' }}>All Countries</MenuItem>
              {countries.slice(0, 50).map((c) => (
                <MenuItem key={c} value={c} sx={{ fontFamily: MONO, fontSize: '0.8rem' }}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}


        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: { xs: 120, sm: 200 } }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.7rem', color: MUTED, whiteSpace: 'nowrap', fontWeight: 600 }}>
            ALT ft
          </Typography>
          <Slider
            value={altRange}
            onChange={(_, v) => setAltRange(v as number[])}
            onChangeCommitted={(_, v) => setAltRangeCommitted(v as number[])}
            min={0}
            max={50000}
            step={1000}
            size="small"
            sx={{
              color: ACCENT,
              flex: 1,
              '& .MuiSlider-thumb': { width: 12, height: 12, '&:hover': { boxShadow: `0 0 0 4px ${ACCENT}22` } },
              '& .MuiSlider-track': { border: 'none' },
              '& .MuiSlider-rail': { opacity: 0.25 },
            }}
          />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.65rem', color: MUTED, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
            {(altRange[0] / 1000).toFixed(0)}k&ndash;{(altRange[1] / 1000).toFixed(0)}k ft
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: { xs: 110, sm: 180 } }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '0.7rem', color: MUTED, whiteSpace: 'nowrap', fontWeight: 600 }}>
            SPD kts
          </Typography>
          <Slider
            value={speedRange}
            onChange={(_, v) => setSpeedRange(v as number[])}
            onChangeCommitted={(_, v) => setSpeedRangeCommitted(v as number[])}
            min={0}
            max={600}
            step={10}
            size="small"
            sx={{
              color: ACCENT,
              flex: 1,
              '& .MuiSlider-thumb': { width: 12, height: 12, '&:hover': { boxShadow: `0 0 0 4px ${ACCENT}22` } },
              '& .MuiSlider-track': { border: 'none' },
              '& .MuiSlider-rail': { opacity: 0.25 },
            }}
          />
          <Typography sx={{ fontFamily: MONO, fontSize: '0.65rem', color: MUTED, whiteSpace: 'nowrap', minWidth: 60, textAlign: 'right' }}>
            {speedRange[0]}&ndash;{speedRange[1]} kts
          </Typography>
        </Box>

        {(statusFilter !== 'all' || countryFilter !== 'all' || searchQuery) && (
          <Chip
            label="Clear"
            size="small"
            onClick={() => {
              setStatusFilter('all');
              setCountryFilter('all');
              setSearchQuery('');
              setAltRange([0, 50000]);
              setSpeedRange([0, 600]);
              setAltRangeCommitted([0, 50000]);
              setSpeedRangeCommitted([0, 600]);
            }}
            sx={{
              height: 22,
              fontSize: '0.65rem',
              fontFamily: MONO,
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: ACCENT,
              border: `1px solid ${ACCENT}44`,
              cursor: 'pointer',
              '&:hover': { backgroundColor: `${ACCENT}11` },
            }}
          />
        )}
      </Box>

      {/* Table */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          mx: { xs: 2, md: 3 },
          my: 2,
          border: `1px solid ${BORDER}`,
          borderRadius: '4px',
          backgroundColor: CARD_BG,
          overflow: 'hidden',
        }}
      >
        {/* Sticky Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 2,
            backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#f8f9fa',
            borderBottom: `1px solid ${BORDER}`,
            height: 40,
            flexShrink: 0,
          }}
        >
          <Typography sx={{ ...headerCellSx, width: isMobile ? 72 : 100 }}>Callsign</Typography>
          <Typography sx={{ ...headerCellSx, width: isMobile ? 64 : 82 }}>ICAO24</Typography>
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 90 : 120 }}>Country</Typography>}
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 100 : 140 }}>Route</Typography>}
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 85 : 100, textAlign: 'right' }}>Lat</Typography>}
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 85 : 100, textAlign: 'right' }}>Lon</Typography>}
          <Typography sx={{ ...headerCellSx, width: isMobile ? 60 : 80, textAlign: 'right' }}>Alt (ft)</Typography>
          <Typography sx={{ ...headerCellSx, width: isMobile ? 55 : 70, textAlign: 'right' }}>Speed (kts)</Typography>
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 60 : 75, textAlign: 'right' }}>Hdg</Typography>}
          {!isMobile && <Typography sx={{ ...headerCellSx, width: isMd ? 65 : 80, textAlign: 'right' }}>V/S (fpm)</Typography>}
          <Typography sx={{ ...headerCellSx, width: isMobile ? 44 : 52, textAlign: 'center' }}>Status</Typography>
          {!isMobile && <Typography sx={{ ...headerCellSx, flex: 1, minWidth: 70 }}>Seen</Typography>}
        </Box>

        {/* Content */}
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: ACCENT }} />
            <Typography sx={{ fontFamily: MONO, fontSize: '0.8rem', color: MUTED }}>
              Connecting to flight data...
            </Typography>
          </Box>
        ) : isEmpty ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <FlightIcon sx={{ fontSize: 48, color: ACCENT, opacity: 0.2, mb: 2 }} />
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED, mb: 1 }}>
              {apiError
                ? 'Unable to connect to flight data service'
                : 'No flight data available'}
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.75rem', color: MUTED, opacity: 0.7 }}>
              {apiError
                ? 'Check your network connection. Retrying automatically...'
                : 'The API may be rate-limited or temporarily unavailable.'}
            </Typography>
            {apiError && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                <ErrorOutlineIcon sx={{ fontSize: 14, color: MUTED }} />
                <Typography sx={{ fontFamily: MONO, fontSize: '0.7rem', color: MUTED }}>
                  Retrying...
                </Typography>
              </Box>
            )}
          </Box>
        ) : noResults ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <SearchIcon sx={{ fontSize: 48, color: ACCENT, opacity: 0.2, mb: 2 }} />
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED, mb: 1 }}>
              No flights match your filters
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.75rem', color: MUTED, opacity: 0.7 }}>
              Try adjusting your search or filter criteria
            </Typography>
          </Box>
        ) : (
          <Box
            ref={scrollContainerRef}
            onScroll={handleScroll}
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              minHeight: 0,
            }}
          >
            <Box sx={{ minWidth: isMobile ? 'auto' : (isMd ? 850 : 1080) }}>
              <Box sx={{ height: startIdx * ROW_HEIGHT }} />
              {visibleRows.map((sv, i) => renderRow(sv, i))}
              <Box sx={{ height: Math.max(0, (filtered.length - endIdx) * ROW_HEIGHT) }} />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default FlightsTableView;
