import { Service } from './infrastructure/service.js';
import { AirportDbService } from './airportDbService.js';

// Types
import type { IService } from './infrastructure/serviceTypes.js';
import type { IAirportData } from './../opensky/types.js';

// Data
import airportData from './../data/airports.json' with { type: 'json' };

export interface IAirportService extends IService {
  getAirport: (icao: string) => IAirportData | undefined;
  getAirportByIata: (iata: string) => IAirportData | undefined;
  searchAirports: (query: string) => IAirportData[];
  getEnrichedAirport: (icao: string) => Promise<IAirportData | null>;
}

export class AirportService extends Service implements IAirportService {

  // Props
  private airports: Map<string, IAirportData> = new Map();
  private iataIndex: Map<string, string> = new Map(); // ICAO -> IATA mapping for reverse lookup
  private enrichedCache: Map<string, IAirportData> = new Map();

  constructor(key: string) {
    super(key);
  };

  protected async onStarting(): Promise<boolean> {

    // Load airport data from JSON
    const data = airportData as unknown as Record<string, IAirportData>;

    for (const [icao, airport] of Object.entries(data)) {
      airport.icao = icao;
      this.airports.set(icao, airport);
      if (airport.iata) {
        this.iataIndex.set(airport.iata.toUpperCase(), icao);
      }
    }

    console.info(`AirportService loaded ${this.airports.size} airports.`);
    return true;
  };

  protected async onStopping(): Promise<boolean> {
    this.airports.clear();
    this.iataIndex.clear();
    this.enrichedCache.clear();
    return true;
  };

  public getAirport = (icao: string): IAirportData | undefined => {
    return this.airports.get(icao.toUpperCase());
  };

  public getAirportByIata = (iata: string): IAirportData | undefined => {
    const icao = this.iataIndex.get(iata.toUpperCase());
    if (!icao) return undefined;
    return this.airports.get(icao);
  };

  public searchAirports = (query: string): IAirportData[] => {
    const lowerQuery = query.toLowerCase();
    const results: IAirportData[] = [];

    for (const airport of this.airports.values()) {
      if (
        airport.name.toLowerCase().includes(lowerQuery) ||
        airport.city?.toLowerCase().includes(lowerQuery) ||
        airport.country.toLowerCase().includes(lowerQuery) ||
        airport.icao?.toLowerCase().includes(lowerQuery) ||
        airport.iata?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(airport);
        if (results.length >= 20) break; // Limit results
      }
    }

    return results;
  };

  public getEnrichedAirport = async (icao: string): Promise<IAirportData | null> => {
    const upperIcao = icao.toUpperCase();

    // Check cache first
    if (this.enrichedCache.has(upperIcao)) {
      return this.enrichedCache.get(upperIcao)!;
    }

    // Try to get from AirportDB API
    const enrichedData = await AirportDbService.getEnrichedAirportData(upperIcao);
    if (enrichedData) {
      this.enrichedCache.set(upperIcao, enrichedData);
      return enrichedData;
    }

    // Fall back to static data
    const staticData = this.airports.get(upperIcao);
    return staticData || null;
  };
}
