import React, { useState, useContext, useRef, useEffect } from 'react';
import { Box, TextField, List, ListItem, ListItemText, ListItemIcon, Typography, Paper, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FlightIcon from '@mui/icons-material/Flight';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';

// Types
import type { IAirportService } from '../services/airportService.js';
import type { IAirportData } from '../opensky/types.js';

interface ILocalProps {
  onAirportSelect?: (airport: IAirportData) => void;
}
type Props = ILocalProps;

const AirportSearch: React.FC<Props> = (props) => {

  // States
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IAirportData[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Contexts
  const appContext = useContext(AppContext);
  const airportService = appContext.getService<IAirportService>(ServiceKeys.AirportService);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (value: string) => {

    setQuery(value);

    if (!airportService || value.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    // Search by ICAO code, IATA code, or name
    const searchResults: IAirportData[] = [];

    // Direct ICAO match
    const icaoMatch = airportService.getAirport(value);
    if (icaoMatch) searchResults.push(icaoMatch);

    // Direct IATA match
    const iataMatch = airportService.getAirportByIata(value);
    if (iataMatch && !searchResults.find(r => r.name === iataMatch.name)) {
      searchResults.push(iataMatch);
    }

    // Name/city search
    const nameResults = airportService.searchAirports(value);
    for (const airport of nameResults) {
      if (!searchResults.find(r => r.name === airport.name)) {
        searchResults.push(airport);
      }
    }

    setResults(searchResults.slice(0, 10));
    setIsOpen(searchResults.length > 0);
  };

  const handleSelect = (airport: IAirportData) => {

    setQuery(airport.iata || airport.name);
    setIsOpen(false);

    if (props.onAirportSelect) {
      props.onAirportSelect(airport);
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: 280
      }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search airports (ICAO, IATA, name)..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
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

      {isOpen && results.length > 0 && (
        <Paper
          elevation={8}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 0.5,
            maxHeight: 300,
            overflow: 'auto',
            zIndex: 1000,
            borderRadius: 2
          }}>
          <List dense>
            {results.map((airport, index) => (
              <ListItem
                key={`${airport.name}-${index}`}
                onClick={() => handleSelect(airport)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FlightIcon fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {airport.iata || airport.name}
                      </Typography>
                      {airport.iata && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {airport.name}
                        </Typography>
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {airport.city && `${airport.city}, `}{airport.country}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default AirportSearch;
