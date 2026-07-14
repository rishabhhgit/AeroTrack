import React, { useMemo, useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, Typography, Divider, useMediaQuery, Tooltip as MuiTooltip } from '@mui/material';
import FlightIcon from '@mui/icons-material/Flight';

import { useNavigation } from '../components/infrastructure/NavigationContext.js';
import { ViewKeys } from './viewKeys.js';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';
import { useAppStore } from '../store/useStore.js';
import maplibregl from 'maplibre-gl';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts';

import type { INavigationElementProps } from '../navigation/navigationTypes.js';
import type { IStateVectorData, IStateVector } from '../opensky/types.js';
import type { IOpenSkyAPIService } from '../services/openSkyAPIService.js';

type Props = INavigationElementProps;

function formatTime(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function getStatus(sv: IStateVector, muted: string, lightText: string): { label: string; color: string } {
  if (sv.on_ground) return { label: 'GND', color: lightText };
  const alt = sv.baro_altitude ?? sv.geo_altitude ?? 0;
  const spd = sv.velocity ?? 0;
  if (alt > 10 || spd > 5) return { label: 'FLY', color: '#d4a017' };
  return { label: 'IDLE', color: muted };
}

const DashboardView: React.FC<Props> = (_props) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const MONO = '"Space Mono", "Courier New", monospace';
  const BG = theme.palette.background.default;
  const CARD_BG = theme.palette.background.paper;
  const BORDER = theme.palette.divider;
  const MUTED = theme.palette.text.secondary;
  const DARK = theme.palette.text.primary;
  const YELLOW = theme.palette.secondary.main;

  const CHART_COLORS = ['#d4a017', '#5c460d', '#c49a1a', '#8b6914', '#725710', '#f5c842', '#e8b832', '#a67c00', '#d97706', '#92400e'];
  const STATUS_COLORS: Record<string, string> = { Flying: '#d4a017', Grounded: '#5c460d' };

  const { navigateByKey } = useNavigation();
  const appContext = useContext(AppContext);
  const openSkyAPIService = appContext.getService<IOpenSkyAPIService>(ServiceKeys.OpenSkyAPIService);
  const setSelectedTrackedIcao = useAppStore((s) => s.setSelectedTrackedIcao);

  const [stateVectors, setStateVectors] = useState<IStateVectorData>({ time: Date.now(), states: [] });
  const [rateLimited, setRateLimited] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const lastGoodDataRef = useRef<IStateVectorData>({ time: Date.now(), states: [] });
  const subscriptionRef = useRef<string>('');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const openSkyRef = useRef(openSkyAPIService);
  openSkyRef.current = openSkyAPIService;

  const handleStateVectorsUpdated = useCallback((data: IStateVectorData) => {
    setInitialLoad(false);
    if (data.states.length > 0) {
      setStateVectors(data);
      lastGoodDataRef.current = data;
      setRateLimited(false);
    } else {
      setRateLimited(true);
      if (lastGoodDataRef.current.states.length > 0) {
        setStateVectors(lastGoodDataRef.current);
      }
    }
  }, []);

  useEffect(() => {
    if (!openSkyRef.current) return;
    openSkyRef.current.geoBounds = {
      southernLatitude: -85, northernLatitude: 85, westernLongitude: -180, easternLongitude: 180,
    };
    const key = openSkyRef.current.onStateVectorsUpdated('DashboardView', handleStateVectorsUpdated);
    subscriptionRef.current = key;
    return () => {
      if (openSkyRef.current) openSkyRef.current.offStateVectorsUpdated(subscriptionRef.current);
    };
  }, [openSkyAPIService, handleStateVectorsUpdated]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: theme.map.style,
      center: [0, 0],
      zoom: 1.5,
      bearing: 0,
      pitch: 0,
      maxZoom: 10,
      minZoom: 0,
      interactive: true,
      attributionControl: false,
      renderWorldCopies: true,
      // Camera control tuning for smoother interaction
      zoomSnap: 0.1, // Snap to 0.1 zoom increments for smoother zoom
      dragPan: {
        deceleration: 0.1, // Smoother panning with gradual slowdown
        linearity: 0.3, // More linear pan response
        maxSpeed: 1400, // Cap maximum pan speed
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    
    // Tune scroll zoom sensitivity
    map.scrollZoom.setZoomRate(0.05); // Reduce zoom sensitivity
    
    // Tune touch controls for mobile
    map.touchZoomRotate.setZoomRate(0.1); // Reduce touch zoom sensitivity
    map.touchZoomRotate.setZoomThreshold(0.2); // Increase threshold before zoom starts
    
    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
      // Ensure globe is properly oriented after projection change
      map.setCenter([0, 0]);
      map.setZoom(1.5);
      map.setBearing(0);
      map.setPitch(0);
    });
    map.on('load', () => {
      mapLoadedRef.current = true;
      map.addSource('dash-ac', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'dash-ac-layer',
        type: 'symbol',
        source: 'dash-ac',
        layout: {
          'icon-image': 'airport',
          'icon-rotate': ['get', 'heading'],
          'icon-allow-overlap': true,
          'icon-size': 0.7,
          'text-field': '',
        },
        paint: {
          'icon-color': DARK,
          'icon-opacity': 0.7,
        },
      });
      map.loadImage(
        'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="' + DARK + '"/></svg>')
      ).then((response) => {
        const img = response.data;
        if (img && !map.hasImage('dash-plane')) map.addImage('dash-plane', img);
        if (map.getLayer('dash-ac-layer')) {
          map.setLayoutProperty('dash-ac-layer', 'icon-image', 'dash-plane');
        }
      }).catch(() => {});
      map.on('click', 'dash-ac-layer', (e) => {
        if (!e.features || e.features.length === 0) return;
        const f = e.features[0];
        if (!f.properties) return;
        const props = f.properties;
        const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const html = `
          <div style="font-family:${MONO};font-size:0.8rem;line-height:1.6;min-width:180px;">
            <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px;">${esc(props.callsign || props.icao24)}</div>
            <div><span style="color:${MUTED};">ICAO24</span> ${esc(props.icao24)}</div>
            <div><span style="color:${MUTED};">Country</span> ${esc(props.country)}</div>
            <div><span style="color:${MUTED};">Alt</span> ${esc(props.altitude)} ft</div>
            <div><span style="color:${MUTED};">Speed</span> ${esc(props.speed)} kts</div>
            <div><span style="color:${MUTED};">Heading</span> ${esc(props.heading)}°</div>
            <div><span style="color:${MUTED};">Lat</span> ${esc(props.lat)}</div>
            <div><span style="color:${MUTED};">Lon</span> ${esc(props.lon)}</div>
            <div><span style="color:${MUTED};">Updated</span> ${esc(props.lastContact)}</div>
          </div>
        `;
        if (popupRef.current) popupRef.current.remove();
        const geom = f.geometry as { type: string; coordinates: [number, number] } | null;
        if (!geom?.coordinates) return;
        popupRef.current = new maplibregl.Popup({ offset: 15, closeButton: true })
          .setLngLat([geom.coordinates[0], geom.coordinates[1]])
          .setHTML(html)
          .addTo(map);
      });
      map.on('mouseenter', 'dash-ac-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'dash-ac-layer', () => { map.getCanvas().style.cursor = ''; });

      const updateGeoBounds = () => {
        const b = map.getBounds();
        if (b && openSkyRef.current) {
          openSkyRef.current.geoBounds = {
            southernLatitude: Math.max(b.getSouth(), -85),
            northernLatitude: Math.min(b.getNorth(), 85),
            westernLongitude: b.getWest(),
            easternLongitude: b.getEast(),
          };
        }
      };
      updateGeoBounds();
      map.on('moveend', updateGeoBounds);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; mapLoadedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Map init runs once; style handled via style.load listener
  }, []);

  // ResizeObserver to handle container dimension changes
  useEffect(() => {
    const container = mapContainerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;

    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const airborne = stateVectors.states.filter(
      (s) => !s.on_ground && s.latitude != null && s.longitude != null
    );
    const features = airborne.slice(0, 2000).map((sv) => {
      const altFt = sv.baro_altitude ? Math.round(sv.baro_altitude * 3.28084) : 0;
      const speedKts = sv.velocity ? Math.round(sv.velocity * 1.94384) : 0;
      const heading = sv.true_track ? Math.round(sv.true_track) : 0;
      const callsign = (sv.callsign || '').trim() || sv.icao24.toUpperCase();
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [sv.longitude!, sv.latitude!] },
        properties: {
          icao24: sv.icao24.toUpperCase(), callsign, country: sv.origin_country || '',
          altitude: altFt, speed: speedKts, heading,
          lat: sv.latitude!.toFixed(4), lon: sv.longitude!.toFixed(4),
          lastContact: formatTime(sv.last_contact),
        },
      };
    });
    const source = map.getSource('dash-ac') as maplibregl.GeoJSONSource;
    if (source) source.setData({ type: 'FeatureCollection', features });
  }, [stateVectors]);

  const positionedStates = useMemo(() => {
    return stateVectors.states.filter(
      (s) => s.latitude != null && s.longitude != null
    );
  }, [stateVectors]);

  const stats = useMemo(() => {
    const all = positionedStates;
    const airborne = all.filter((s) => !s.on_ground);
    const countries = new Set(all.map((s) => s.origin_country).filter((c) => c && c !== 'Others' && c !== 'Unknown'));
    const onGround = all.filter((s) => s.on_ground);

    let totalAlt = 0; let altCount = 0; let maxAlt = 0;
    let totalSpeed = 0; let speedCount = 0;
    for (const sv of airborne) {
      const alt = sv.baro_altitude ?? sv.geo_altitude ?? 0;
      if (alt > 0) { totalAlt += alt; altCount++; if (alt > maxAlt) maxAlt = alt; }
      const spd = sv.velocity ?? 0;
      if (spd > 0) { totalSpeed += spd * 1.94384; speedCount++; }
    }

    const countryCounts = new Map<string, number>();
    for (const sv of all) {
      const c = sv.origin_country;
      if (!c || c === 'Others' || c === 'Unknown') continue;
      countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
    }
    let busiestAirspace = '';
    let busiestCount = 0;
    for (const [country, count] of countryCounts) {
      if (count > busiestCount) { busiestCount = count; busiestAirspace = country; }
    }

    const departures = all.filter(
      (s) => !s.on_ground && (s.vertical_rate ?? 0) > 0 && (s.baro_altitude ?? s.geo_altitude ?? 0) < 1000
    ).length;

    const arrivals = all.filter(
      (s) => !s.on_ground && (s.vertical_rate ?? 0) < 0 && (s.baro_altitude ?? s.geo_altitude ?? 0) < 1000
    ).length;

    const withCallsign = all.filter(
      (s) => s.callsign && s.callsign.trim().length > 0
    ).length;

    return {
      liveFlights: airborne.length,
      totalTracked: all.length,
      countries: countries.size,
      avgAlt: altCount > 0 ? Math.round(totalAlt / altCount) : 0,
      maxAlt: Math.round(maxAlt),
      avgSpeed: speedCount > 0 ? Math.round(totalSpeed / speedCount) : 0,
      onGround: onGround.length,
      busiestAirspace,
      busiestCount,
      departures,
      arrivals,
      withPosition: all.length,
      withoutPosition: stateVectors.states.length - all.length,
      withCallsign,
      withoutCallsign: all.length - withCallsign,
    };
  }, [positionedStates, stateVectors.states.length]);

  const activityFeed = useMemo(() => {
    return positionedStates
      .filter((s) => s.callsign && s.callsign.length > 0)
      .sort((a, b) => (b.last_contact || 0) - (a.last_contact || 0))
      .slice(0, 50);
  }, [positionedStates]);

  const countryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const sv of positionedStates) {
      const c = sv.origin_country;
      if (!c || c === 'Others' || c === 'Unknown') continue;
      map.set(c, (map.get(c) || 0) + 1);
    }
    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const top15 = sorted.slice(0, 15);
    return top15.map(([name, value]) => ({ name, value }));
  }, [positionedStates]);

  const altitudeDistData = useMemo(() => {
    const bins = { 'Ground': 0, '0–1k ft': 0, '1k–10k ft': 0, '10k–20k ft': 0, '20k–30k ft': 0, '30k–40k ft': 0, '40k+ ft': 0 };
    for (const sv of positionedStates) {
      if (sv.on_ground) { bins['Ground']++; continue; }
      const altFt = ((sv.baro_altitude ?? sv.geo_altitude ?? 0)) * 3.28084;
      if (altFt <= 0) bins['0–1k ft']++;
      else if (altFt <= 1000) bins['0–1k ft']++;
      else if (altFt <= 10000) bins['1k–10k ft']++;
      else if (altFt <= 20000) bins['10k–20k ft']++;
      else if (altFt <= 30000) bins['20k–30k ft']++;
      else if (altFt <= 40000) bins['30k–40k ft']++;
      else bins['40k+ ft']++;
    }
    return Object.entries(bins).map(([name, value]) => ({ name, value }));
  }, [positionedStates]);

  const speedDistData = useMemo(() => {
    const bins = { '0–100 kts': 0, '100–200 kts': 0, '200–300 kts': 0, '300–400 kts': 0, '400–500 kts': 0, '500+ kts': 0 };
    for (const sv of positionedStates) {
      if (sv.on_ground) continue;
      const kts = (sv.velocity ?? 0) * 1.94384;
      if (kts <= 0) continue;
      else if (kts <= 100) bins['0–100 kts']++;
      else if (kts <= 200) bins['100–200 kts']++;
      else if (kts <= 300) bins['200–300 kts']++;
      else if (kts <= 400) bins['300–400 kts']++;
      else if (kts <= 500) bins['400–500 kts']++;
      else bins['500+ kts']++;
    }
    return Object.entries(bins).map(([name, value]) => ({ name, value }));
  }, [positionedStates]);

  const statusData = useMemo(() => {
    let flying = 0; let grounded = 0;
    for (const sv of positionedStates) {
      if (sv.on_ground) grounded++;
      else flying++;
    }
    return [
      { name: 'Flying', value: flying },
      { name: 'Grounded', value: grounded },
    ].filter((d) => d.value > 0);
  }, [positionedStates]);

  const recentUpdates = useMemo(() => {
    return positionedStates
      .filter((s) => s.callsign && s.callsign.length > 0)
      .sort((a, b) => (b.last_contact || 0) - (a.last_contact || 0))
      .slice(0, 20);
  }, [positionedStates]);

  const handleFlightSelect = useCallback((icao24: string) => {
    setSelectedTrackedIcao(icao24);
    navigateByKey(ViewKeys.FlightDetailsView);
  }, [navigateByKey, setSelectedTrackedIcao]);

  useEffect(() => {
    if (import.meta.env.DEV && stateVectors.states.length > 0) {
      const raw = stateVectors.states;
      const rawWithPos = raw.filter((s) => s.latitude != null && s.longitude != null);
      const rawAirborne = rawWithPos.filter((s) => !s.on_ground);
      const rawGrounded = rawWithPos.filter((s) => s.on_ground);
      const rawCountries = new Set(rawWithPos.map((s) => s.origin_country).filter(Boolean));
      const rawAltSum = rawAirborne.reduce((sum, s) => sum + (s.baro_altitude ?? s.geo_altitude ?? 0), 0);
      const rawAltCount = rawAirborne.filter((s) => (s.baro_altitude ?? s.geo_altitude ?? 0) > 0).length;
      const rawSpeedSum = rawAirborne.reduce((sum, s) => sum + ((s.velocity ?? 0) * 1.94384), 0);
      const rawSpeedCount = rawAirborne.filter((s) => (s.velocity ?? 0) > 0).length;
      const rawWithCallsign = rawWithPos.filter((s) => s.callsign && s.callsign.trim().length > 0).length;

      const d = (a: number, b: number) => a === b ? 'PASS' : `FAIL(${a - b})`;
      const altChartTotal = altitudeDistData.reduce((s, x) => s + x.value, 0);
      const spdChartTotal = speedDistData.reduce((s, x) => s + x.value, 0);
      const statusChartTotal = statusData.reduce((s, x) => s + x.value, 0);

      console.debug('%c=== Dashboard Verification ===', 'color: #d4a017; font-weight: bold; font-size: 12px;');
      console.debug(`[Raw] Total: ${raw.length} | Pos: ${rawWithPos.length} | Air: ${rawAirborne.length} | Gnd: ${rawGrounded.length} | Ctry: ${rawCountries.size} | Csgn: ${rawWithCallsign}`);
      console.debug(`[Dash] Total: ${stats.totalTracked} | Air: ${stats.liveFlights} | Gnd: ${stats.onGround} | Ctry: ${stats.countries} | Csgn: ${stats.withCallsign} | Dep: ${stats.departures} | Arr: ${stats.arrivals}`);
      console.debug(`[Avg] Alt: ${stats.avgAlt}m (raw ${rawAltCount > 0 ? Math.round(rawAltSum / rawAltCount) : 0}m) | Spd: ${stats.avgSpeed}kts (raw ${rawSpeedCount > 0 ? Math.round(rawSpeedSum / rawSpeedCount) : 0}kts) | Busiest: ${stats.busiestAirspace}(${stats.busiestCount})`);
      console.debug(`[Verify] Total:${d(stats.totalTracked, rawWithPos.length)} Air:${d(stats.liveFlights, rawAirborne.length)} Gnd:${d(stats.onGround, rawGrounded.length)} Ctry:${d(stats.countries, rawCountries.size)} Csgn:${d(stats.withCallsign, rawWithCallsign)}`);
      console.debug(`[Verify] Alt:${d(stats.avgAlt, rawAltCount > 0 ? Math.round(rawAltSum / rawAltCount) : 0)} Spd:${d(stats.avgSpeed, rawSpeedCount > 0 ? Math.round(rawSpeedSum / rawSpeedCount) : 0)}`);
      console.debug(`[Charts] Ctry:${countryData.length}/${rawCountries.size} ${countryData.length === rawCountries.size ? 'PASS' : 'FAIL'} AltTotal:${altChartTotal}/${rawWithPos.length} ${altChartTotal === rawWithPos.length ? 'PASS' : 'FAIL'} SpdTotal:${spdChartTotal}/${rawAirborne.length} ${spdChartTotal === rawAirborne.length ? 'PASS' : 'FAIL'} StatusTotal:${statusChartTotal}/${rawWithPos.length} ${statusChartTotal === rawWithPos.length ? 'PASS' : 'FAIL'}`);
    }
  }, [stateVectors, positionedStates, stats, countryData, altitudeDistData, speedDistData, statusData]);

  const skeletonBlock = (
    <Box sx={{ mx: { xs: 2, md: 4 }, mt: 2 }}>
      <Box sx={{ display: 'flex', border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, flexWrap: 'wrap', gap: 0 }}>
        {[...Array(6)].map((_, i) => (
          <Box key={i} sx={{ flex: 1, minWidth: 100, py: 3, px: 2 }}>
            <Box className="skeleton-box" sx={{ width: 70, height: 12, mb: 1 }} />
            <Box className="skeleton-box" sx={{ width: 90, height: 28 }} />
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
        {[...Array(4)].map((_, i) => (
          <Box key={i} sx={{ border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, p: 2.5 }}>
            <Box className="skeleton-box" sx={{ width: 120, height: 14, mb: 2 }} />
            <Box className="skeleton-box" sx={{ width: '100%', height: 180 }} />
          </Box>
        ))}
      </Box>
    </Box>
  );

  if (rateLimited && lastGoodDataRef.current.states.length === 0) {
    return (
      <Box sx={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: BG, gap: 2 }}>
        <FlightIcon sx={{ fontSize: 48, color: YELLOW, opacity: 0.4 }} />
        <Typography sx={{ fontFamily: MONO, fontSize: '1rem', color: MUTED }}>
          Live data temporarily unavailable.
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', color: MUTED, opacity: 0.7 }}>
          Retrying in a few seconds...
        </Typography>
      </Box>
    );
  }

  const isLoading = initialLoad && stateVectors.states.length === 0;

  return (
    <Box sx={{ flex: 1, width: '100%', overflow: 'auto', backgroundColor: BG, minHeight: 0, scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
      <Box sx={{ px: { xs: 2, md: 4 }, pt: 3, pb: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ fontFamily: MONO, fontSize: { xs: '1.2rem', md: '1.6rem' }, fontWeight: 700, letterSpacing: '0.05em', color: DARK }}>
          Dashboard
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', color: MUTED, letterSpacing: '0.05em' }}>
          {positionedStates.length > 0 ? `${positionedStates.length.toLocaleString()} aircraft tracked` : 'Connecting...'}
        </Typography>
        {rateLimited && stateVectors.states.length > 0 && (
          <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: '#a67c00', letterSpacing: '0.05em' }}>
            RATE LIMITED — showing cached data
          </Typography>
        )}
        {!rateLimited && stateVectors.states.length > 0 && (
          <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: '#d4a017', letterSpacing: '0.05em' }}>
            LIVE
          </Typography>
        )}
        {stats.busiestAirspace && (
          <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: MUTED, letterSpacing: '0.05em' }}>
            Busiest: {stats.busiestAirspace} ({stats.busiestCount.toLocaleString()})
          </Typography>
        )}
        {stateVectors.time > 0 && (
          <MuiTooltip title={`API timestamp: ${new Date(stateVectors.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`} arrow>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: MUTED, letterSpacing: '0.05em', cursor: 'default' }}>
              Updated: {formatTime(stateVectors.time)}
            </Typography>
          </MuiTooltip>
        )}
        {stats.withoutPosition > 0 && (
          <MuiTooltip title={`${stats.withoutPosition.toLocaleString()} aircraft have no position data`} arrow>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: MUTED, letterSpacing: '0.05em', opacity: 0.7 }}>
              {stats.withoutPosition.toLocaleString()} without position
            </Typography>
          </MuiTooltip>
        )}
      </Box>

      {isLoading && skeletonBlock}

      {!isLoading && (
        <Box className="stagger-in" sx={{ mx: { xs: 2, md: 4 }, display: 'flex', border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, flexWrap: 'wrap' }}>
          {[
            { label: 'In Flight', value: stats.liveFlights, color: '#d4a017' },
            { label: 'Total Tracked', value: stats.totalTracked },
            { label: 'Countries', value: stats.countries },
            { label: 'On Ground', value: stats.onGround, color: '#6b7280' },
            { label: 'Departures', value: stats.departures, color: '#4caf50' },
            { label: 'Arrivals', value: stats.arrivals, color: '#f44336' },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <Divider orientation="vertical" flexItem sx={{ borderColor: BORDER }} />}
              <Box sx={{ flex: 1, textAlign: 'center', py: 2.5, px: 1.5, minWidth: 100 }}>
                <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, mb: 0.5, fontWeight: 400 }}>{s.label}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
                  <Typography sx={{ fontFamily: MONO, fontSize: { xs: '1.4rem', md: '2rem' }, fontWeight: 700, lineHeight: 1, color: s.color || DARK }}>
                    {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                  </Typography>
                </Box>
              </Box>
            </React.Fragment>
          ))}
        </Box>
      )}

      {!isLoading && (
        <Box className="stagger-in" sx={{ mx: { xs: 2, md: 4 }, mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {[
            { label: 'Avg Alt', value: `${stats.avgAlt.toLocaleString()} m`, sub: `Max ${stats.maxAlt.toLocaleString()} m` },
            { label: 'Avg Speed', value: `${stats.avgSpeed.toLocaleString()} kts`, sub: null },
            { label: 'With Callsign', value: stats.withCallsign.toLocaleString(), sub: `${stats.withoutCallsign.toLocaleString()} missing` },
            { label: 'With Position', value: stats.withPosition.toLocaleString(), sub: `${stats.withoutPosition.toLocaleString()} missing` },
          ].map((s) => (
            <Box key={s.label} sx={{ flex: 1, minWidth: 140, py: 1.5, px: 2, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 400 }}>{s.label}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: '1.1rem', fontWeight: 700, color: DARK, mt: 0.25 }}>{s.value}</Typography>
              {s.sub && <Typography sx={{ fontFamily: MONO, fontSize: '0.75rem', color: MUTED, mt: 0.25 }}>{s.sub}</Typography>}
            </Box>
          ))}
        </Box>
      )}

      {/* Map always rendered so maplibregl ref exists on mount */}
      <Box sx={{ mx: { xs: 2, md: 4 }, mt: 2, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>Live Flight Map</Typography>
          <Typography onClick={() => navigateByKey(ViewKeys.MapView)} sx={{ fontFamily: MONO, fontSize: '1.0rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600, cursor: 'pointer', '&:hover': { color: DARK }, transition: 'color 0.15s' }}>
            Open Full Map
          </Typography>
        </Box>
        <Box sx={{ height: { xs: 320, sm: 400, md: 480, lg: 540 }, width: '100%', backgroundColor: theme.palette.background.default, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Box sx={{
            position: 'absolute', bottom: 10, right: 14,
            fontFamily: MONO, fontSize: '0.95rem', color: MUTED,
            backgroundColor: CARD_BG, opacity: 0.95, px: 1.5, py: 0.5, border: `1px solid ${BORDER}`,
            zIndex: 10,
          }}>
            {stats.liveFlights} live aircraft ({stats.totalTracked} total)
          </Box>
        </Box>
      </Box>

      <Box className="stagger-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {[
          { title: 'Aircraft by Country', height: Math.max(400, countryData.length * 35 + 80), chart: (
            <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', pr: 0.5,
              scrollBehavior: 'smooth',
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: 'rgba(0,0,0,0.2)', borderRadius: 3 },
              '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(0,0,0,0.35)' },
            }}>
              <ResponsiveContainer width="100%" height={Math.max(400, countryData.length * 35 + 80)}>
                <BarChart data={countryData} layout="vertical" margin={{ left: isMobile ? 100 : 160, right: 50, top: 12, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
                  <XAxis type="number" tick={{ fontFamily: MONO, fontSize: 11, color: MUTED }} stroke={BORDER} allowDecimals={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontFamily: MONO, fontSize: isMobile ? 10 : 12, color: DARK, fontWeight: 500 }} width={isMobile ? 95 : 155} tickFormatter={(value: string) => value.length > 25 ? `${value.slice(0, 23)}...` : value} tickLine={false} />
                  <Tooltip contentStyle={{ fontFamily: MONO, fontSize: '0.9rem', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} formatter={(value?: unknown, _name?: unknown, entry?: { payload?: { name?: string } }) => {
                    const count = Number(value ?? 0);
                    const percentage = stats.totalTracked > 0 ? ((count / stats.totalTracked) * 100).toFixed(1) : '0.0';
                    return [`${count.toLocaleString()} aircraft (${percentage}%)`, entry?.payload?.name ?? 'Count'];
                  }} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive animationDuration={500} animationEasing="ease-out" barSize={20}>
                    {countryData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.name === 'Others' ? '#9ca3af' : CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )},
          { title: 'Altitude Distribution', height: 480, chart: (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={altitudeDistData} margin={{ left: 10, right: 10, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="name" tick={{ fontFamily: MONO, fontSize: isMobile ? 9 : 11, color: DARK }} stroke={BORDER} interval={0} angle={isMobile ? -35 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 60 : 30} tickLine={false} />
                <YAxis tick={{ fontFamily: MONO, fontSize: 11, color: MUTED }} stroke={BORDER} allowDecimals={false} tickLine={false} />
                <Tooltip contentStyle={{ fontFamily: MONO, fontSize: '0.9rem', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} formatter={(value?: unknown) => [`${Number(value ?? 0).toLocaleString()} aircraft`, 'Count']} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500} animationEasing="ease-out">
                  {altitudeDistData.map((_entry, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[(idx + 3) % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )},
          { title: 'Speed Distribution', height: 480, chart: (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speedDistData} margin={{ left: 10, right: 10, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="name" tick={{ fontFamily: MONO, fontSize: isMobile ? 9 : 11, color: DARK }} stroke={BORDER} interval={0} angle={isMobile ? -35 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 60 : 30} tickLine={false} />
                <YAxis tick={{ fontFamily: MONO, fontSize: 11, color: MUTED }} stroke={BORDER} allowDecimals={false} tickLine={false} />
                <Tooltip contentStyle={{ fontFamily: MONO, fontSize: '0.9rem', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} formatter={(value?: unknown) => [`${Number(value ?? 0).toLocaleString()} aircraft`, 'Count']} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={500} animationEasing="ease-out">
                  {speedDistData.map((_entry, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[(idx + 6) % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )},
          { title: 'Aircraft by Status', height: 480, chart: (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%" cy="50%"
                  innerRadius={isMobile ? 35 : 50}
                  outerRadius={isMobile ? 55 : 75}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {statusData.map((entry, idx) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: MONO, fontSize: '0.9rem', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
              </PieChart>
            </ResponsiveContainer>
          )},
        ].map((section) => (
          <Box key={section.title} sx={{ border: `1px solid ${BORDER}`, backgroundColor: CARD_BG, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
              <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{section.title}</Typography>
            </Box>
            <Box sx={{ p: 2, height: { xs: section.height, md: section.height }, overflow: 'hidden' }}>
              {section.chart}
            </Box>
          </Box>
        ))}
      </Box>

      <Box className="fade-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>Live Activity Feed</Typography>
          <Typography onClick={() => navigateByKey(ViewKeys.FlightsTableView)} sx={{ fontFamily: MONO, fontSize: '1.0rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600, cursor: 'pointer', '&:hover': { color: DARK }, transition: 'color 0.15s' }}>
            All Flights
          </Typography>
        </Box>
        <Box sx={{ overflow: 'auto', maxHeight: 400 }}>
          <Box sx={{ display: 'flex', px: 2.5, py: 1.25, borderBottom: `1px solid ${BORDER}`, backgroundColor: theme.palette.action.hover }}>
            {['Time', 'Callsign', 'Country', 'Altitude', 'Speed', 'Status'].map((h) => (
              <Typography key={h} sx={{ fontFamily: MONO, fontSize: '0.95rem', letterSpacing: '0.1em', color: MUTED, fontWeight: 600, flex: h === 'Callsign' ? 1.5 : h === 'Country' ? 1.2 : 1, textTransform: 'uppercase' }}>
                {h}
              </Typography>
            ))}
          </Box>
          {activityFeed.map((sv, i) => {
            const callsign = (sv.callsign || sv.icao24).trim();
            const altFt = sv.baro_altitude ? Math.round(sv.baro_altitude * 3.28084) : 0;
            const speedKts = sv.velocity ? Math.round(sv.velocity * 1.94384) : 0;
            const status = getStatus(sv, MUTED, '#6b7280');
            return (
              <Box key={`${sv.icao24}-${i}`} className="table-row" onClick={() => handleFlightSelect(sv.icao24)} sx={{
                display: 'flex', px: 2.5, py: 1.5, alignItems: 'center',
                borderBottom: i < activityFeed.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: MUTED, flex: 1 }}>{formatTime(sv.last_contact)}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', fontWeight: 700, color: DARK, flex: 1.5 }}>{callsign}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: '0.95rem', color: MUTED, flex: 1.2 }}>{sv.origin_country || ''}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: DARK, flex: 1 }}>{altFt > 0 ? `${altFt.toLocaleString()} ft` : 'GND'}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: DARK, flex: 1 }}>{speedKts > 0 ? `${speedKts} kts` : ''}</Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', color: status.color, flex: 1, fontWeight: 600 }}>{status.label}</Typography>
              </Box>
            );
          })}
          {activityFeed.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED }}>Loading live flight data...</Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Box className="fade-in" sx={{ mx: { xs: 2, md: 4 }, mt: 2, mb: 4, border: `1px solid ${BORDER}`, backgroundColor: CARD_BG }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
          <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>Recent Updates</Typography>
        </Box>
        <Box sx={{ position: 'relative', px: 3, py: 2.5, backgroundColor: 'transparent' }}>
          {recentUpdates.map((sv, i) => {
            const callsign = (sv.callsign || sv.icao24).trim();
            const altFt = sv.baro_altitude ? Math.round(sv.baro_altitude * 3.28084) : 0;
            return (
              <Box key={`${sv.icao24}-${i}`} onClick={() => handleFlightSelect(sv.icao24)} sx={{
                display: 'flex', gap: 2, pb: 2.5, cursor: 'pointer',
                position: 'relative', '&:hover': { opacity: 0.7 }, transition: 'opacity 0.15s',
              }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60, flexShrink: 0, backgroundColor: 'transparent' }}>
                  <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED }}>{formatTime(sv.last_contact)}</Typography>
                  {i < recentUpdates.length - 1 && (
                    <Box sx={{ width: '1px', flex: 1, backgroundColor: BORDER, mt: 0.5, opacity: 0.4 }} />
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: -0.25, backgroundColor: 'transparent' }}>
                  <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', fontWeight: 700, color: DARK }}>{callsign}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', color: MUTED }}>
                    {sv.origin_country || ''} · {altFt > 0 ? `${altFt.toLocaleString()} ft` : 'GND'}
                    {sv.velocity ? ` · ${Math.round(sv.velocity * 1.94384)} kts` : ''}
                  </Typography>
                </Box>
              </Box>
            );
          })}
          {recentUpdates.length === 0 && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED }}>Loading updates...</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardView;
