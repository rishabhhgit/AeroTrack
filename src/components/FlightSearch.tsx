import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, TextField, List, ListItem, ListItemText, ListItemIcon, Typography, Paper, InputAdornment, Chip, LinearProgress, IconButton, Divider } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FlightIcon from '@mui/icons-material/Flight';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import HistoryIcon from '@mui/icons-material/History';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useAppStore } from '../store/useStore.js';

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

const authFetch = async (url: string, signal?: AbortSignal): Promise<{ states?: Array<Array<number | string | boolean | null>> }> => {
  const response = await fetch(url, { signal, headers: { 'Accept': 'application/json' } });
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
  const [showHistory, setShowHistory] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const { searchHistory, addSearchHistory, clearSearchHistory } = useAppStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const mapApiState = (raw: unknown[]): IFlightResult | null => {
    if (!Array.isArray(raw) || raw.length < 12) return null;
    const latitude = raw[6] as number | null;
    const longitude = raw[5] as number | null;
    if (latitude == null || longitude == null) return null;
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
      if (sv.latitude == null || sv.longitude == null) continue;
      const callsign = (sv.callsign || '').trim();
      if (!callsign) continue;
      const callsignUpper = callsign.toUpperCase();
      const icao24Upper = sv.icao24.toUpperCase();
      if (callsignUpper.startsWith(cleanQuery) || callsignUpper.includes(cleanQuery) || icao24Upper === cleanQuery) {
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
              addSearchHistory(cleanQuery, result.icao24);
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
        addSearchHistory(cleanQuery, localMatches[0]?.icao24);
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
          const icaoUpper = result.icao24.toUpperCase();
          if (csUpper.startsWith(cleanQuery) || csUpper.includes(cleanQuery) || icaoUpper === cleanQuery) {
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
          addSearchHistory(cleanQuery, unique[0]?.icao24);
        } else {
          setResults([]);
          setNoResults(true);
          if (isIataFlightNumber(cleanQuery)) {
            setSearchMessage(`Flight ${cleanQuery} not found in live data. Try using ICAO callsign instead.`);
          } else {
            setSearchMessage(`No flights matching "${cleanQuery}" found.`);
          }
          setIsOpen(true);
        }
      } else {
        setResults([]);
        setNoResults(true);
        setSearchMessage('No data available — API may be rate-limited. Please wait a moment and try again.');
        setIsOpen(true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Flight search failed:', error);
      setResults([]);
      setNoResults(true);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setSearchMessage('Network error — check your internet connection and try again.');
      } else {
        setSearchMessage('Search failed — please try again later.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setNoResults(false);
    setSearchMessage('');
    setShowHistory(false);
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
    setShowHistory(false);
    if (props.onFlightSelect) props.onFlightSelect(flight.icao24);
  };

  const handleHistorySelect = (entry: { query: string; icao24?: string }) => {
    setQuery(entry.query);
    setShowHistory(false);
    if (entry.icao24 && props.onFlightSelect) {
      props.onFlightSelect(entry.icao24);
    } else {
      searchFlights(entry.query);
    }
  };

  const handleFlyTo = (e: React.MouseEvent, flight: IFlightResult) => {
    e.stopPropagation();
    if (props.onFlyTo) props.onFlyTo(flight.latitude, flight.longitude);
  };

  const handleFocus = () => {
    if (results.length > 0 || noResults) {
      setIsOpen(true);
    } else if (query.length === 0 && searchHistory.length > 0) {
      setShowHistory(true);
      setIsOpen(true);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setNoResults(false);
    setSearchMessage('');
    setShowHistory(false);
    if (abortRef.current) abortRef.current.abort();
  };

  const filteredHistory = useMemo(() => {
    if (!query) return searchHistory.slice(0, 5);
    const q = query.toUpperCase();
    return searchHistory.filter(e => e.query.toUpperCase().includes(q)).slice(0, 5);
  }, [searchHistory, query]);

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: { xs: '100%', sm: 400 } }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search flights, ICAO24, or callsign..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.length >= 1) {
            clearTimeout(searchTimeoutRef.current);
            searchFlights(query);
          }
          if (e.key === 'Escape') {
            setIsOpen(false);
            setShowHistory(false);
          }
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear} sx={{ p: 0.25 }}>
                <ClearIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </IconButton>
            </InputAdornment>
          ) : undefined
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'background.paper',
            borderRadius: 0,
            fontFamily: '"Space Mono", monospace',
            fontSize: '0.95rem',
            border: '1px solid',
            borderColor: 'divider',
            '& fieldset': { border: 'none' },
            '&:hover': { borderColor: 'secondary.main' },
            '&.Mui-focused': { borderColor: 'secondary.main' },
          },
          '& .MuiInputBase-input::placeholder': {
            color: 'text.secondary',
            opacity: 1,
            fontFamily: '"Space Mono", monospace',
            fontSize: '0.95rem',
          },
        }}
      />

      {isSearching && (
        <LinearProgress
          sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 0 }}
        />
      )}

      {isOpen && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            mt: 0.5, maxHeight: 400, overflow: 'auto', zIndex: 1000, borderRadius: 0, p: 1,
            backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider',
          }}>
          
          {/* Search History */}
          {showHistory && filteredHistory.length > 0 && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1, pb: 0.5 }}>
                <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  Recent Searches
                </Typography>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); clearSearchHistory(); }} sx={{ p: 0.25 }}>
                  <DeleteSweepIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                </IconButton>
              </Box>
              <List dense>
                {filteredHistory.map((entry, idx) => (
                  <ListItem
                    key={`${entry.query}-${idx}`}
                    onClick={() => handleHistorySelect(entry)}
                    sx={{ cursor: 'pointer', py: 0.25, '&:hover': { backgroundColor: 'rgba(212, 160, 23, 0.06)' } }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <HistoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem' }}>{entry.query}</Typography>
                      }
                      secondary={
                        <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary' }}>
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
              <Divider sx={{ my: 0.5, borderColor: 'divider' }} />
            </>
          )}

          {/* Search Results */}
          {results.length > 0 ? (
            <List dense>
              {results.map((flight) => (
                <ListItem
                  key={flight.icao24}
                  onClick={() => handleSelect(flight)}
                  sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(212, 160, 23, 0.06)' } }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FlightIcon fontSize="small" sx={{ color: 'secondary.main' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem', fontWeight: 700, color: 'text.primary' }}>
                          {flight.callsign}
                        </Typography>
                        <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.85rem', color: 'text.secondary' }}>
                          {flight.icao24}
                        </Typography>
                        <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.85rem', color: 'text.secondary' }}>
                          {flight.origin_country}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                        <Chip
                          icon={<LocationOnIcon sx={{ fontSize: 12, color: 'secondary.main !important' }} />}
                          label={`${flight.latitude.toFixed(4)}, ${flight.longitude.toFixed(4)}`}
                          size="small"
                          variant="outlined"
                          onClick={(e) => handleFlyTo(e, flight)}
                          sx={{ height: 20, fontSize: '0.9rem', fontFamily: '"Space Mono", monospace', cursor: 'pointer', borderColor: 'divider', color: 'text.secondary' }}
                        />
                        <Chip
                          label={flight.altitude <= 0 ? 'GND' : `${Math.round(flight.altitude)}m`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.9rem', fontFamily: '"Space Mono", monospace', borderColor: 'divider', color: flight.on_ground ? 'text.secondary' : 'text.primary' }}
                        />
                        <Chip
                          label={flight.on_ground ? 'On Ground' : `${Math.round(flight.velocity * 3.6)} km/h`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.9rem', fontFamily: '"Space Mono", monospace', borderColor: 'divider', color: 'text.secondary' }}
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
                <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary' }}>
                  {searchMessage || 'Searching...'}
                </Typography>
              ) : (
                <>
                  <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary', mb: 1 }}>
                    {searchMessage || `No results for "${query}"`}
                  </Typography>
                  <Box sx={{ textAlign: 'left', px: 1, py: 1, backgroundColor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 0 }}>
                    <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.95rem', color: 'text.secondary', mb: 0.5, fontWeight: 700 }}>
                      Search tips:
                    </Typography>
                    <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary', mb: 0.3 }}>
                      - ICAO callsign (e.g. UAE4N), not IATA (EK722)
                    </Typography>
                    <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary', mb: 0.3 }}>
                      - ICAO24 hex (e.g. 8960f7) for precise lookup
                    </Typography>
                    <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary', mb: 0.3 }}>
                      - Aircraft codes (B77W, A380) cannot be searched
                    </Typography>
                    <Typography sx={{ fontFamily: '"Space Mono", monospace', fontSize: '0.9rem', color: 'text.secondary' }}>
                      - Flights over oceans may not appear (ADS-B ground data)
                    </Typography>
                  </Box>
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
