import React, { useState, useContext, useEffect } from 'react';
import { Box, Typography, IconButton, CircularProgress, Divider, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RunwayIcon from '@mui/icons-material/FlightTakeoff';
import FrequencyIcon from '@mui/icons-material/SettingsInputAntenna';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TerrainIcon from '@mui/icons-material/Terrain';
import PublicIcon from '@mui/icons-material/Public';
import MapIcon from '@mui/icons-material/Map';
import { AppContext } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';
import { getWeather, type IWeatherData } from '../services/weatherService.js';

// Types
import type { IAirportData } from '../opensky/types.js';
import type { IAirportService } from '../services/airportService.js';

interface ILocalProps {
  airport: IAirportData;
  onClose?: () => void;
}
type Props = ILocalProps;

const AirportDetailPanel: React.FC<Props> = (props) => {

  // States
  const [enrichedAirport, setEnrichedAirport] = useState<IAirportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [weather, setWeather] = useState<IWeatherData | null>(null);

  // Contexts
  const appContext = useContext(AppContext);
  const airportService = appContext.getService<IAirportService>(ServiceKeys.AirportService);

  // Effects
  useEffect(() => {
    let cancelled = false;

    const fetchEnrichedData = async () => {
      if (!airportService || !props.airport.icao) {
        setLoading(false);
        return;
      }

      try {
        const enriched = await airportService.getEnrichedAirport(props.airport.icao);
        if (!cancelled) setEnrichedAirport(enriched);
      } catch (error) {
        console.error('Failed to fetch enriched airport data:', error);
        if (!cancelled) setEnrichedAirport(props.airport);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEnrichedData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fetch only re-runs when ICAO changes
  }, [props.airport.icao, airportService]);

  // Fetch weather for this airport
  useEffect(() => {
    let cancelled = false;

    const fetchWeatherData = async () => {
      const lat = props.airport.latitude;
      const lng = props.airport.longitude;

      if (!lat || !lng) return;

      try {
        const w = await getWeather(lat, lng);
        if (!cancelled) setWeather(w);
      } catch (e) {
        console.warn('Weather fetch failed:', e);
      }
    };

    fetchWeatherData();
    return () => { cancelled = true; };
  }, [props.airport.icao, props.airport.latitude, props.airport.longitude]);

  const airport = enrichedAirport || props.airport;

  // Calculate local time based on timezone
  const getLocalTime = (): string => {
    try {
      if (airport.timezone) {
        const now = new Date();
        return now.toLocaleTimeString('en-US', {
          timeZone: airport.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      }
    } catch { /* timezone not recognized */ }
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getLocalDate = (): string => {
    try {
      if (airport.timezone) {
        const now = new Date();
        return now.toLocaleDateString('en-US', {
          timeZone: airport.timezone,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
    } catch { /* timezone not recognized */ }
    return new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const renderRunways = () => {
    if (!airport.runways || airport.runways.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No runway data available
        </Typography>
      );
    }

    return (
      <Box sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <RunwayIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            Runways ({airport.runways.length})
          </Typography>
        </Box>

        {airport.runways.map((runway, index) => (
          <Box
            key={runway.id || index}
            sx={{
              mb: 1,
              p: 1,
              backgroundColor: 'action.hover',
              borderRadius: 1
            }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {runway.le_ident} / {runway.he_ident}
              </Typography>
              <Chip
                label={runway.surface}
                size="small"
                sx={{ height: 20, fontSize: '0.85rem' }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {runway.length_ft.toLocaleString()} ft × {runway.width_ft} ft
              {runway.lighted && ' • Lighted'}
              {runway.closed && ' • CLOSED'}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  const renderFrequencies = () => {
    if (!airport.frequencies || airport.frequencies.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No frequency data available
        </Typography>
      );
    }

    return (
      <Box sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FrequencyIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            Frequencies ({airport.frequencies.length})
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 0.5
          }}>
          {airport.frequencies.map((freq, index) => (
            <Box
              key={freq.id || index}
              sx={{
                p: 0.5,
                backgroundColor: 'action.hover',
                borderRadius: 0.5
              }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
                {freq.frequency_mhz.toFixed(3)} MHz
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                {freq.type} - {freq.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          minWidth: 280,
          maxHeight: 'calc(100vh - 160px)',
          backgroundColor: 'background.paper',
          borderRadius: 2,
          boxShadow: 5,
          opacity: 0.95,
          display: 'flex',
          flexDirection: 'column',
          alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          justifyItems: 'center',
          padding: 2
        }}>
        <CircularProgress color="primary" size={32} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          Loading airport details...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        right: 16,
        minWidth: 280,
        maxWidth: 320,
        maxHeight: 'calc(100vh - 160px)',
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 5,
        opacity: 0.95,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>

      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          borderBottom: 1,
          borderColor: 'divider'
        }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {airport.iata || airport.icao}
            </Typography>
            {airport.iata && airport.icao && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {airport.icao}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={props.onClose}
            sx={{ ml: 1 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {airport.name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {airport.city && `${airport.city}, `}{airport.country}
        </Typography>

        {airport.source === 'airportdb' && (
          <Chip
            label="Live data"
            size="small"
            color="success"
            sx={{ mt: 0.5, height: 20, fontSize: '0.85rem', alignSelf: 'flex-start' }}
          />
        )}
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1.5
        }}>
        {/* Coordinates */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <MapIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Location
            </Typography>
          </Box>
          <Typography variant="body2">
            {airport.latitude.toFixed(4)}°, {airport.longitude.toFixed(4)}°
          </Typography>
          {airport.altitude !== undefined && airport.altitude !== 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <TerrainIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Elevation: {airport.altitude} ft ({Math.round(airport.altitude * 0.3048)} m)
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Timezone & Local Time */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <AccessTimeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Local Time
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {getLocalTime()}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {getLocalDate()}
          </Typography>
          {airport.timezone && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              Timezone: {airport.timezone}
            </Typography>
          )}
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Country Info */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <PublicIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Region
            </Typography>
          </Box>
          <Typography variant="body2">
            {airport.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {airport.city && `${airport.city}, `}{airport.country}
          </Typography>
          {airport.dst && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              Daylight Savings: {airport.dst}
            </Typography>
          )}
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Weather */}
        {weather && (
          <>
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <ThermostatIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Weather
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Chip
                  label={`${Math.round(weather.temperature)}°C`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.8rem' }}
                />
                <Chip
                  label={`Wind: ${Math.round(weather.windspeed)} km/h @ ${Math.round(weather.winddirection)}°`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.8rem' }}
                />
                <Chip
                  label={weather.description}
                  size="small"
                  variant="outlined"
                  color="info"
                  sx={{ height: 20, fontSize: '0.8rem' }}
                />
              </Box>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
          </>
        )}

        {/* Runways */}
        <Box sx={{ mb: 1.5 }}>
          {renderRunways()}
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        {/* Frequencies */}
        <Box>
          {renderFrequencies()}
        </Box>
      </Box>
    </Box>
  );
};

export default AirportDetailPanel;
