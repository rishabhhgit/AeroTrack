const EARTH_RADIUS_M = 6371000;

export const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export const formatSpeed = (ms: number): string => {
  const kmh = ms * 3.6;
  const kts = kmh * 0.539957;
  return `${Math.round(kts)} kts`;
}

export const formatAltitude = (meters: number): string => {
  const feet = Math.round(meters * 3.28084);
  if (feet >= 1000) {
    return `${(feet / 1000).toFixed(1)}k ft`;
  }
  return `${feet} ft`;
}

export const getFlightPhase = (
  isOnGround: boolean,
  altitude: number,
  verticalRate: number,
  depTime: number | null,
  arrTime: number | null,
  currentTime: number | null
): string => {
  if (isOnGround && altitude < 100) {
    if (depTime && currentTime && currentTime < depTime + 600) return 'boarding';
    if (arrTime && currentTime && currentTime > arrTime - 300) return 'landed';
    return 'on_ground';
  }
  if (verticalRate > 2 && altitude < 3000) return 'climbing';
  if (verticalRate < -2 && altitude < 3000) return 'descending';
  if (altitude > 10000) return 'cruise';
  return 'en_route';
}

export const getFlightStatusLabel = (phase: string): { label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default' } => {
  switch (phase) {
    case 'boarding': return { label: 'Boarding', color: 'info' };
    case 'climbing': return { label: 'Climbing', color: 'success' };
    case 'cruise': return { label: 'Cruising', color: 'success' };
    case 'descending': return { label: 'Descending', color: 'warning' };
    case 'landing': return { label: 'Landing', color: 'warning' };
    case 'landed': return { label: 'Landed', color: 'default' };
    case 'on_ground': return { label: 'On Ground', color: 'default' };
    case 'en_route': return { label: 'En Route', color: 'success' };
    case 'diverted': return { label: 'Diverted', color: 'error' };
    case 'cancelled': return { label: 'Cancelled', color: 'error' };
    default: return { label: 'Unknown', color: 'default' };
  }
}

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
}