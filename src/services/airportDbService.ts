import type { IAirportData } from '../opensky/types.js';

export interface IRunway {
  id: string;
  airport_ref: string;
  airport_ident: string;
  length_ft: number;
  width_ft: number;
  surface: string;
  lighted: boolean;
  closed: boolean;
  le_ident: string;
  le_elevation_ft: number;
  le_heading_deg: number;
  le_displaced_threshold_ft: number;
  he_ident: string;
  he_elevation_ft: number;
  he_heading_deg: number;
  he_displaced_threshold_ft: number;
}

export interface IFrequency {
  id: string;
  airport_ref: string;
  airport_ident: string;
  type: string;
  name: string;
  frequency_mhz: number;
}

export interface IAirportDbResponse {
  name: string;
  iata: string;
  icao: string;
  latitude: number;
  longitude: number;
  elevation: number;
  continent: string;
  wikipedia_link: string;
  keywords: string[];
  runways: IRunway[];
  frequencies: IFrequency[];
  country: {
    name: string;
    iso: string;
  };
  region: {
    name: string;
    iso: string;
  };
}

const API_BASE = '/airportdbapi';

export const AirportDbService = {
  async getAirportByIcao(icao: string): Promise<IAirportDbResponse | null> {
    try {
      const response = await fetch(`${API_BASE}/airport/${icao}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.airport || data;
    } catch (error) {
      console.error('Failed to fetch airport from AirportDB:', error);
      return null;
    }
  },

  async getAirportByIata(iata: string): Promise<IAirportDbResponse | null> {
    try {
      const response = await fetch(`${API_BASE}/airport/iata/${iata}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.airport || data;
    } catch (error) {
      console.error('Failed to fetch airport from AirportDB by IATA:', error);
      return null;
    }
  },

  convertToIAirportData(data: IAirportDbResponse): IAirportData {
    return {
      icao: data.icao,
      iata: data.iata || null,
      name: data.name,
      city: data.region?.name || null,
      country: data.country?.name || '',
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.elevation || 0,
      timezone: '',
      dst: '',
      type: 'airport',
      source: 'airportdb',
      runways: (data.runways || []).map(r => ({
        id: r.id,
        length_ft: r.length_ft,
        width_ft: r.width_ft,
        surface: r.surface,
        lighted: r.lighted,
        closed: r.closed,
        le_ident: r.le_ident,
        le_elevation_ft: r.le_elevation_ft,
        le_heading_deg: r.le_heading_deg,
        le_displaced_threshold_ft: r.le_displaced_threshold_ft,
        he_ident: r.he_ident,
        he_elevation_ft: r.he_elevation_ft,
        he_heading_deg: r.he_heading_deg,
        he_displaced_threshold_ft: r.he_displaced_threshold_ft,
      })),
      frequencies: (data.frequencies || []).map(f => ({
        id: f.id,
        type: f.type,
        name: f.name,
        frequency_mhz: f.frequency_mhz,
      })),
    };
  },

  async getEnrichedAirportData(icao: string): Promise<IAirportData | null> {
    const dbData = await this.getAirportByIcao(icao);
    if (!dbData) {
      return null;
    }
    return this.convertToIAirportData(dbData);
  }
};
