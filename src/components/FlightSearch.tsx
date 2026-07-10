import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, List, ListItem, ListItemText, ListItemIcon, Typography, Paper, InputAdornment, Chip, LinearProgress, Alert } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FlightIcon from '@mui/icons-material/Flight';
import LocationOnIcon from '@mui/icons-material/LocationOn';

import type { IStateVectorData } from '../opensky/types.js';

interface IFlightResult {
  icao24: string;
  callsign: string;
  origin_country: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  on_ground: boolean;
  true_track: number;
}

interface ILocalProps {
  stateVectors: IStateVectorData;
  onFlightSelect?: (icao24: string) => void;
  onFlyTo?: (lat: number, lng: number) => void;
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

const getAuthToken = async (): Promise<string | null> => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  try {
    const response = await fetch(`/oskytokenapi?nocache=${Date.now()}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.access_token && data.expires_in) {
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return cachedToken;
    }
  } catch {
    return null;
  }
  return null;
};

const authFetch = async (url: string, signal?: AbortSignal): Promise<any> => {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

const isIcao24Hex = (s: string): boolean => /^[0-9a-f]{6}$/i.test(s);

const isIataFlightNumber = (s: string): boolean => /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(s);

const FlightSearch: React.FC<ILocalProps> = (props) => {

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IFlightResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const mapApiState = (raw: any[]): IFlightResult | null => {
    const latitude = raw[6] as number | null;
    const longitude = raw[5] as number | null;
    if (latitude === null || longitude === null) return null;
    let altitude = raw[13] as number | null;
    if (altitude === null || altitude < 0) altitude = raw[7] as number | null;
    if (altitude === null || altitude < 0) altitude = 0;
    return {
      icao24: raw[0] as string,
      callsign: ((raw[1] as string) || '').trim() || raw[0] as string,
      origin_country: raw[2] as string,
      latitude, longitude, altitude,
      velocity: (raw[9] as number) || 0,
      on_ground: raw[8] as boolean,
      true_track: (raw[10] as number) || 0
    };
  };

  const searchLocal = (cleanQuery: string): IFlightResult[] => {
    const matches: IFlightResult[] = [];
    for (const sv of props.stateVectors.states) {
      if (!sv.latitude || !sv.longitude) continue;
      const callsign = (sv.callsign || '').trim();
      if (!callsign) continue;
      const callsignUpper = callsign.toUpperCase();
      if (callsignUpper.startsWith(cleanQuery) || callsignUpper.includes(cleanQuery)) {
        let altitude = sv.geo_altitude;
        if (altitude === null || altitude < 0) altitude = sv.baro_altitude;
        if (altitude === null || altitude < 0) altitude = 0;
        matches.push({
          icao24: sv.icao24, callsign,
          origin_country: sv.origin_country,
          latitude: sv.latitude, longitude: sv.longitude,
          altitude, velocity: sv.velocity || 0,
          on_ground: sv.on_ground, true_track: sv.true_track || 0
        });
        if (matches.length >= 15) break;
      }
    }
    return matches;
  };

  const searchFlights = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 1) {
      setResults([]);
      setNoResults(false);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    setNoResults(false);
    setSearchMessage('');

    try {
      const cleanQuery = searchQuery.trim().toUpperCase();

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      if (isIcao24Hex(cleanQuery)) {
        setSearchMessage('Looking up aircraft by ICAO24...');
        try {
          const data = await authFetch(
            `/oskyapi/states/all?icao24=${cleanQuery.toLowerCase()}&extended=1`,
            signal
          );
          if (data.states && data.states.length > 0) {
            const result = mapApiState(data.states[0]);
            if (result) {
              setResults([result]);
              setIsOpen(true);
              setIsSearching(false);
              return;
            }
          }
        } catch {
          if (signal.aborted) return;
        }
        setResults([]);
        setNoResults(true);
        setSearchMessage(`ICAO24 "${cleanQuery}" not found — aircraft may not be airborne or transmitting.`);
        setIsOpen(true);
        setIsSearching(false);
        return;
      }

      const localMatches = searchLocal(cleanQuery);
      if (localMatches.length > 0) {
        setResults(localMatches);
        setIsOpen(true);
        setIsSearching(false);
        return;
      }

      setSearchMessage('Searching all flights globally...');
      const data = await authFetch(
        `/oskyapi/states/all?extended=1&lamin=-90&lomin=-180&lamax=90&lomax=180`,
        signal
      );

      if (signal.aborted) return;

      if (data.states && Array.isArray(data.states)) {
        const matches: IFlightResult[] = [];
        for (const raw of data.states) {
          const result = mapApiState(raw);
          if (!result) continue;
          const csUpper = result.callsign.toUpperCase();
          if (csUpper.startsWith(cleanQuery) || csUpper.includes(cleanQuery)) {
            matches.push(result);
          }
          if (matches.length >= 10) break;
        }

        if (matches.length > 0) {
          const seen = new Set<string>();
          const unique = matches.filter(m => {
            if (seen.has(m.icao24)) return false;
            seen.add(m.icao24);
            return true;
          });
          setResults(unique);
          setIsOpen(true);
        } else {
          setResults([]);
          setNoResults(true);
          if (isIataFlightNumber(cleanQuery)) {
            setSearchMessage(`Flight ${cleanQuery} not found in live data.`);
          } else {
            setSearchMessage(`No flights matching "${cleanQuery}" found.`);
          }
          setIsOpen(true);
        }
      } else {
        setResults([]);
        setNoResults(true);
        setSearchMessage('No data available — API may be rate-limited.');
        setIsOpen(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Flight search failed:', error);
      setResults([]);
      setNoResults(true);
      setSearchMessage('Search failed — try again');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setNoResults(false);
    setSearchMessage('');
    clearTimeout(searchTimeoutRef.current);
    if (value.length < 1) {
      setResults([]);
      setIsOpen(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      searchFlights(value);
    }, 500);
  };

  const handleSelect = (flight: IFlightResult) => {
    setQuery(flight.callsign);
    setIsOpen(false);
    if (props.onFlightSelect) props.onFlightSelect(flight.icao24);
  };

  const handleFlyTo = (e: React.MouseEvent, flight: IFlightResult) => {
    e.stopPropagation();
    if (props.onFlyTo) props.onFlyTo(flight.latitude, flight.longitude);
  };

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: 280 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="ICAO24, callsign, or flight no..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => {
          if (results.length > 0 || noResults) setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.length >= 1) {
            clearTimeout(searchTimeoutRef.current);
            searchFlights(query);
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          )
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'background.paper',
            borderRadius: 2
          }
        }}
      />

      {isSearching && (
        <LinearProgress
          sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2 }}
        />
      )}

      {isOpen && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            mt: 0.5, maxHeight: 400, overflow: 'auto', zIndex: 1000, borderRadius: 2, p: 1
          }}>
          {results.length > 0 ? (
            <List dense>
              {results.map((flight) => (
                <ListItem
                  key={flight.icao24}
                  onClick={() => handleSelect(flight)}
                  sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FlightIcon fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {flight.callsign}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {flight.icao24}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {flight.origin_country}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                        <Chip
                          icon={<LocationOnIcon sx={{ fontSize: 12 }} />}
                          label={`${flight.latitude.toFixed(4)}, ${flight.longitude.toFixed(4)}`}
                          size="small"
                          variant="outlined"
                          onClick={(e) => handleFlyTo(e, flight)}
                          sx={{ height: 20, fontSize: '0.65rem', cursor: 'pointer' }}
                        />
                        <Chip
                          label={flight.altitude <= 0 ? 'GND' : `${Math.round(flight.altitude)}m`}
                          size="small"
                          variant="outlined"
                          color={flight.on_ground ? 'default' : 'primary'}
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                        <Chip
                          label={flight.on_ground ? 'On Ground' : `${Math.round(flight.velocity * 3.6)} km/h`}
                          size="small"
                          variant="outlined"
                          color={flight.on_ground ? 'warning' : 'default'}
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ p: 1.5, textAlign: 'center' }}>
              {isSearching ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {searchMessage}
                </Typography>
              ) : (
                <>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                    {searchMessage || `No results for "${query}"`}
                  </Typography>
                  <Alert severity="info" sx={{ textAlign: 'left', fontSize: '0.75rem' }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Search tips:</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.3 }}>
                      - Use ICAO callsign (e.g. <b>UAE4N</b>), not IATA number (EK722)
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.3 }}>
                      - Use ICAO24 hex code (e.g. <b>8960f7</b>) for precise lookup
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.3 }}>
                      - Flights over oceans or remote areas may not appear — this tracker uses ground-based ADS-B data
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      - Aircraft type codes (B77W, A380, etc.) cannot be searched
                    </Typography>
                  </Alert>
                </>
              )}
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default FlightSearch;
