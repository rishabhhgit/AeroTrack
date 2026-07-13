import { Service } from './infrastructure/service.js';
import { URL, Constants } from './../opensky/constants.js';
import { ServiceStateEnumeration } from './infrastructure/serviceTypes.js';
import { ServiceKeys } from './serviceKeys.js';
import { ResponseStateEnumeration } from './restService.js';
import { StateVectorChangeTypeEnumeration } from './../opensky/types.js';

// Types
import type { IService } from './infrastructure/serviceTypes.js';
import type { IRESTService } from './restService.js';
import type { IStateVectorData, IStateVectorRawData, IStateVectorChangeType, IStateVector, IAircraftFlight, IAircraftTrack, IAircraftRoute, IAircraftMetadata, IMapGeoBounds } from './../opensky/types.js';

const defaultStateInterval: number = 10000;
const registeredStateInterval: number = 10000;
const metadataInterval: number = 30000;
const rateLimitBackoffBase: number = 30000;

export type StateVectorsUpdatedCallbackMethod = (stateVectors: IStateVectorData) => void;
interface IStateVectorsUpdatedSubscriberDictionary { [key: string]: StateVectorsUpdatedCallbackMethod };

export type AircraftTrackUpdatedCallbackMethod = (track: IAircraftTrack) => void;
interface IAircraftTrackUpdatedSubscriberDictionary { [key: string]: AircraftTrackUpdatedCallbackMethod };

export interface IOpenSkyAPIService extends IService {
  geoBounds: IMapGeoBounds;
  lastKnownStateVectors: IStateVectorData | null;
  onStateVectorsUpdated: (contextKey: string, callbackHandler: StateVectorsUpdatedCallbackMethod) => string;
  offStateVectorsUpdated: (registerKey: string) => boolean;
  trackAircraft: (icao24: string) => void;
  releaseTrack: (icao24: string) => void;
  onAircraftTrackUpdated: (contextKey: string, callbackHandler: AircraftTrackUpdatedCallbackMethod) => string;
  offAircraftTrackUpdated: (registerKey: string) => boolean;
  fetchRoute: (icao24: string) => Promise<{ departureAirport: string | null; arrivalAirport: string | null } | null>;
};

export class OpenSkyAPIService extends Service implements IOpenSkyAPIService {

  // IOpenSkyAPIService
  public geoBounds: IMapGeoBounds;

  // Props
  private restService?: IRESTService;

  private clientId?: string;
  private clientSecret?: string;
  private accessToken: string | null = null;
  private expiresAt: number = 0; // Unix Timestamp in ms
  private hasCredentials: boolean = false;
  private getRequestInit: RequestInit = {};
  private lastPositions = new Map<string, IStateVectorChangeType>();

  private fetchStateVectorsIntervalID: number = 0;
  private isFetchingStateVectors: boolean = false;
  private stateVectorsUpdatedSubscriberDictionary: IStateVectorsUpdatedSubscriberDictionary = {};
  private stateVectorsUpdatedSubscriptionCounter: number = 0;

  private fetchAircraftStateIntervalID: number = 0;
  private isFetchingAircraftStateVector: boolean = false;

  private fetchAircraftRouteIntervalID: number = 0;
  private isFetchingAircraftRoute: boolean = false;

  private fetchAircraftDataIntervalID: number = 0;
  private isFetchingAircraftData: boolean = false;

  private rateLimitConsecutive429: number = 0;
  private cachedStateVectors: IStateVectorData | null = null;
  private stopped: boolean = false;

  public get lastKnownStateVectors(): IStateVectorData | null { return this.cachedStateVectors; }

  private aircraftTrackUpdatedSubscriberDictionary: IAircraftTrackUpdatedSubscriberDictionary = {};
  private aircraftTrackUpdatedSubscriptionCounter: number = 0;
  private trackedAircraft: IAircraftTrack;

  constructor(key: string, clientId?: string, clientSecret?: string) {
    super(key);

    this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.geoBounds = {
      southernLatitude: Constants.DEFAULT_MIN_LATITUDE,
      northernLatitude: Constants.DEFAULT_MAX_LATITUDE,
      westernLongitude: Constants.DEFAULT_MIN_LONGITUDE,
      easternLongitude: Constants.DEFAULT_MAX_LONGITUDE
    };

    this.trackedAircraft = {
      icao24: '',
      callsign: ''
    };
  };

  public onStateVectorsUpdated = (contextKey: string, callbackHandler: StateVectorsUpdatedCallbackMethod) => {

    // Setup register key
    this.stateVectorsUpdatedSubscriptionCounter++;
    const registerKey = `${contextKey}_${this.stateVectorsUpdatedSubscriptionCounter}`

    // Register callback
    this.stateVectorsUpdatedSubscriberDictionary[registerKey] = callbackHandler;

    // Immediately send last known data so views don't stay stuck on skeleton
    if (this.cachedStateVectors && this.cachedStateVectors.states.length > 0) {
      try { callbackHandler(this.cachedStateVectors); } catch (e) { console.error(`Immediate callback for ${registerKey} error:`, e); }
    }

    return registerKey;
  };

  public offStateVectorsUpdated = (registerKey: string) => {

    // Delete callback
    if (registerKey in this.stateVectorsUpdatedSubscriberDictionary) {

      delete this.stateVectorsUpdatedSubscriberDictionary[registerKey];
      return true;
    }
    else {

      console.error(`Component with key '${registerKey}' not registered on 'StateVectorsUpdated'.`);
      return false;
    };
  };

  public trackAircraft = (icao24: string) => {

    if (this.trackedAircraft.icao24 !== '') {
      console.info(`Release tracking for aircraft '${this.trackedAircraft.icao24}'.`);
    }

    clearTimeout(this.fetchAircraftStateIntervalID);
    clearTimeout(this.fetchAircraftRouteIntervalID);
    clearTimeout(this.fetchAircraftDataIntervalID);

    this.trackedAircraft.icao24 = icao24;
    this.trackedAircraft.callsign = '';
    console.info(`Start tracking for aircraft '${icao24}'.`);

    this.fetchAircraftState();
    this.fetchAircraftRoute();
    this.fetchAircraftData();

    const fetchStateVectorInterval: number = this.hasCredentials ? registeredStateInterval : defaultStateInterval;
    this.fetchAircraftStateIntervalID = window.setTimeout(this.fetchAircraftState, fetchStateVectorInterval);
    this.fetchAircraftRouteIntervalID = window.setTimeout(this.fetchAircraftRoute, metadataInterval);
    this.fetchAircraftDataIntervalID = window.setTimeout(this.fetchAircraftData, metadataInterval);
  };

  public releaseTrack = (icao24: string) => {

    clearTimeout(this.fetchAircraftStateIntervalID);
    clearTimeout(this.fetchAircraftRouteIntervalID);
    clearTimeout(this.fetchAircraftDataIntervalID);

    this.trackedAircraft.icao24 = '';
    this.trackedAircraft.callsign = '';
    console.info(`Release tracking for aircraft '${icao24}'.`);
  };

  public onAircraftTrackUpdated = (contextKey: string, callbackHandler: AircraftTrackUpdatedCallbackMethod) => {

    // Setup register key
    this.aircraftTrackUpdatedSubscriptionCounter++;
    const registerKey = `${contextKey}_${this.aircraftTrackUpdatedSubscriptionCounter}`

    // Register callback
    this.aircraftTrackUpdatedSubscriberDictionary[registerKey] = callbackHandler;
    return registerKey;
  };

  public offAircraftTrackUpdated = (registerKey: string) => {

    // Delete callback
    if (registerKey in this.aircraftTrackUpdatedSubscriberDictionary) {

      delete this.aircraftTrackUpdatedSubscriberDictionary[registerKey];
      return true;
    }
    else {

      console.error(`Component with key '${registerKey}' not registered on 'AircraftTrackUpdated'.`);
      return false;
    };
  };

  protected async onStarting(): Promise<boolean> {

    // Check for service provider
    if (!this.serviceProvider) {
      this.updateState(ServiceStateEnumeration.Error);
      console.error(`No service provider is injected. Service ${this.key} cannot be started.`);
      return false;
    };

    // Get the REST service
    this.restService = this.serviceProvider.getService<IRESTService>(ServiceKeys.RESTService);
    if (!this.restService) {
      this.updateState(ServiceStateEnumeration.Error);
      console.error(`No REST service is available. Service ${this.key} cannot be started.`);
      return false;
    };

    this.stopped = false;
    this.getRequestInit = this.restService.getDefaultRequestInit('GET');
    this.hasCredentials = !!this.clientId && !!this.clientSecret;
    console.info(`Service ${this.key} has credentials: ${this.hasCredentials}`);

    if (this.hasCredentials) {

      this.getRequestInit.mode = 'cors';
      this.getRequestInit.credentials = 'omit';

      this.restService.setAuthorization(async () => {
        try {
          const token = await this.getAccessToken();
          return `Bearer ${token}`;
        } catch (e) {
          console.warn(`OAuth token unavailable, falling back to unauthenticated mode: ${e}`);
          this.hasCredentials = false;
          this.restService?.setAuthorization(undefined);
          this.getRequestInit.mode = 'same-origin';
          this.getRequestInit.credentials = 'same-origin';
          return '';
        }
      });
    } else {
      this.restService.setAuthorization(undefined);
    }

    this.fetchStateVectors(); // Fetch immediately on start; .finally() chains the next call

    return true;
  };

  protected async onStopping(): Promise<boolean> {
    this.stopped = true;
    clearTimeout(this.fetchStateVectorsIntervalID);
    clearTimeout(this.fetchAircraftStateIntervalID);
    clearTimeout(this.fetchAircraftRouteIntervalID);
    clearTimeout(this.fetchAircraftDataIntervalID);
    this.lastPositions.clear();
    this.stateVectorsUpdatedSubscriberDictionary = {};
    this.aircraftTrackUpdatedSubscriberDictionary = {};

    return true;
  };

  private mapRawStateVectorData = (rawData: IStateVectorRawData) => {

    const data: IStateVectorData = {
      time: rawData.time,
      states: []
    };

    if (!rawData.states)
      return data;

    const activeIcaos = new Set<string>();
    for (const rawStateVector of rawData.states) {
      activeIcaos.add(String(rawStateVector[0]));

      let changeType = StateVectorChangeTypeEnumeration.None;
      const lastVectorPosition = this.lastPositions.get(String(rawStateVector[0]));
      if (!lastVectorPosition) {
        changeType = StateVectorChangeTypeEnumeration.PositionChanged;
      }
      else if (lastVectorPosition.latitude !== rawStateVector[6] || lastVectorPosition.longitude !== rawStateVector[5]) {
        changeType = StateVectorChangeTypeEnumeration.PositionChanged;
      }
      else if (lastVectorPosition.time_state !== rawData.time) {
        changeType = StateVectorChangeTypeEnumeration.OtherChanged;
      }

      this.lastPositions.set(String(rawStateVector[0]), {
        time_state: rawData.time,
        time_position: rawStateVector[3] as number | null,
        latitude: rawStateVector[6] as number | null,
        longitude: rawStateVector[5] as number | null
      });

      const stateVector: IStateVector = {
        changeType: changeType,
        icao24: String(rawStateVector[0]),
        callsign: String(rawStateVector[1]) || null,
        origin_country: String(rawStateVector[2]),
        time_position: rawStateVector[3] as number | null,
        last_contact: Number(rawStateVector[4]) || 0,
        longitude: rawStateVector[5] as number | null,
        latitude: rawStateVector[6] as number | null,
        baro_altitude: rawStateVector[7] as number | null,
        on_ground: Boolean(rawStateVector[8]),
        velocity: rawStateVector[9] as number | null,
        true_track: rawStateVector[10] as number | null,
        vertical_rate: rawStateVector[11] as number | null,
        sensors: rawStateVector[12] as Array<number> | null,
        geo_altitude: rawStateVector[13] as number | null,
        squawk: String(rawStateVector[14]) || null,
        spi: Boolean(rawStateVector[15]),
        position_source: Number(rawStateVector[16]) || 0,
        category: Number(rawStateVector[17]) || 0,
      }

      data.states.push(stateVector);
    }

    // Evict stale entries from lastPositions
    for (const key of Array.from(this.lastPositions.keys())) {
      if (!activeIcaos.has(key)) {
        this.lastPositions.delete(key);
      }
    }

    return data;
  };

  private tokenPromise: Promise<string> | null = null;

  private async getAccessToken(): Promise<string> {
    if (this.tokenPromise) {
      return this.tokenPromise;
    }
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    this.tokenPromise = this.fetchToken();
    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  };

  private async fetchToken(): Promise<string> {

    const response = await fetch(`/oskytokenapi?nocache=${Date.now()}`, { method: "GET" });

    if (!response.ok)
      throw new Error("Proxy OAuth2 token request failed: " + response.statusText);

    const data = await response.json();

    if (!data.access_token || !data.expires_in)
      throw new Error("Token response is missing access_token or expires_in.");

    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + Math.max(0, data.expires_in - 60) * 1000; // 1 minute before expiration

    return data.access_token as string;
  };

  private getBackoffDelay(): number {
    if (this.rateLimitConsecutive429 === 0) return 0;
    return Math.min(rateLimitBackoffBase * Math.pow(2, this.rateLimitConsecutive429 - 1), 300000);
  }

  private fetchStateVectors = () => {

    if (!this.restService)
      return;

    if (this.isFetchingStateVectors)
      return;

    this.isFetchingStateVectors = true;

    const stateBounds = `?extended=1&lamin=${this.geoBounds.southernLatitude}&lomin=${this.geoBounds.westernLongitude}&lamax=${this.geoBounds.northernLatitude}&lomax=${this.geoBounds.easternLongitude}`;
    const targetURL = `${URL}/states/all${stateBounds}`;

    this.restService.get<IStateVectorRawData>(targetURL, this.getRequestInit)
      .then(response => {

        if (response.state === ResponseStateEnumeration.Error || !response.payload) {
          this.rateLimitConsecutive429++;
          console.warn(`State vectors request failed (attempt ${this.rateLimitConsecutive429}). Backoff: ${this.getBackoffDelay()}ms`);
          const cached = this.cachedStateVectors;
          Object.entries(this.stateVectorsUpdatedSubscriberDictionary).forEach(([key, value]) => {
            try { value(cached ?? { time: Math.floor(Date.now() / 1000), states: [] }); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
          });
        } else {
          this.rateLimitConsecutive429 = 0;
          const mappedData = this.mapRawStateVectorData(response.payload);
          this.cachedStateVectors = mappedData;
          Object.entries(this.stateVectorsUpdatedSubscriberDictionary).forEach(([key, value]) => {
            try { value(mappedData); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
          })
        }

      })
      .catch((error) => {
        console.error('State vectors fetch error:', error);
        this.rateLimitConsecutive429++;
        this.isFetchingStateVectors = false;
        const cached = this.cachedStateVectors;
        Object.entries(this.stateVectorsUpdatedSubscriberDictionary).forEach(([key, value]) => {
          try { value(cached ?? { time: Math.floor(Date.now() / 1000), states: [] }); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
        });
      })
      .finally(() => {

        this.isFetchingStateVectors = false;
        if (this.stopped) return;
        const baseInterval: number = this.hasCredentials ? registeredStateInterval : defaultStateInterval;
        const delay = baseInterval + this.getBackoffDelay();
        this.fetchStateVectorsIntervalID = window.setTimeout(this.fetchStateVectors, delay);
      })
  };

  private fetchAircraftState = () => {

    if (!this.restService)
      return;

    if (this.trackedAircraft.icao24 === '')
      return;

    if (this.isFetchingAircraftStateVector)
      return;

    this.isFetchingAircraftStateVector = true;

    const targetURL = `${URL}/states/all?&icao24=${this.trackedAircraft.icao24}`;

    this.restService.get<IStateVectorRawData>(targetURL, this.getRequestInit)
      .then(response => {

        if (response.state === ResponseStateEnumeration.Error || !response.payload) {
          this.rateLimitConsecutive429++;
        } else {
          this.rateLimitConsecutive429 = 0;
          const mappedData = this.mapRawStateVectorData(response.payload);

          if (mappedData.states.length > 0) {

            this.trackedAircraft.stateVector = mappedData.states[0]
            this.trackedAircraft.callsign = this.trackedAircraft.stateVector.callsign ? this.trackedAircraft.stateVector.callsign : '';

            const trackCopy = { ...this.trackedAircraft };
            Object.entries(this.aircraftTrackUpdatedSubscriberDictionary).forEach(([key, value]) => {
              try { value(trackCopy); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
            })
          }
        }

        this.isFetchingAircraftStateVector = false;
      })
      .catch((error) => {
        console.error('Aircraft state fetch error:', error);
        this.isFetchingAircraftStateVector = false;
      })
      .finally(() => {

        this.isFetchingAircraftStateVector = false;
        if (this.stopped) return;
        const baseInterval: number = this.hasCredentials ? registeredStateInterval : defaultStateInterval;
        const delay = baseInterval + this.getBackoffDelay();
        this.fetchAircraftStateIntervalID = window.setTimeout(this.fetchAircraftState, delay);
      })
  };

  private fetchAircraftRoute = () => {

    if (!this.restService)
      return;

    if (this.trackedAircraft.callsign === '' && this.trackedAircraft.icao24 === '')
      return;

    if (this.isFetchingAircraftRoute)
      return;

    this.isFetchingAircraftRoute = true;

    const now = Math.floor(Date.now() / 1000);
    const begin = now - 86400;
    const targetURL = `${URL}/flights/aircraft?icao24=${this.trackedAircraft.icao24}&begin=${begin}&end=${now}`;

    this.restService.get<IAircraftFlight[]>(targetURL, this.getRequestInit)      .then(response => {

        if (response.payload && Array.isArray(response.payload) && response.payload.length > 0) {

          const isAirborne = this.trackedAircraft.stateVector && !this.trackedAircraft.stateVector.on_ground;
          const currentTime = this.trackedAircraft.stateVector?.time_position || Math.floor(Date.now() / 1000);

          let flight;
          if (isAirborne) {
            flight = response.payload.find((f: IAircraftFlight) =>
              f.firstSeen <= currentTime && (currentTime - f.lastSeen) < 600
            );
            if (!flight) flight = response.payload[response.payload.length - 1];
          } else {
            flight = response.payload[response.payload.length - 1];
          }

          const route: IAircraftRoute = {
            icao24: flight.icao24 || this.trackedAircraft.icao24,
            callsign: flight.callsign || this.trackedAircraft.callsign,
            estDepartureAirport: flight.estDepartureAirport || null,
            estArrivalAirport: flight.estArrivalAirport || null,
            route: null
          };

          this.trackedAircraft.route = route;
          const trackCopy = { ...this.trackedAircraft };
          Object.entries(this.aircraftTrackUpdatedSubscriberDictionary).forEach(([key, value]) => {
            try { value(trackCopy); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
          });
        }

        this.isFetchingAircraftRoute = false;
      })
      .catch((error) => {
        console.error('Aircraft route fetch error:', error);
        this.isFetchingAircraftRoute = false;
      })
      .finally(() => {

        this.isFetchingAircraftRoute = false;
        if (this.stopped) return;
        this.fetchAircraftRouteIntervalID = window.setTimeout(this.fetchAircraftRoute, metadataInterval * 4);
      })
  };

  private fetchAircraftData = () => {

    if (!this.restService)
      return;

    if (this.trackedAircraft.icao24 === '')
      return;

    if (this.isFetchingAircraftData)
      return;

    this.isFetchingAircraftData = true;

    const targetURL = `${URL}/metadata/aircraft/icao/${this.trackedAircraft.icao24}`;

    this.restService.get<IAircraftMetadata>(targetURL, this.getRequestInit)
      .then(response => {

        if (response.payload) {

          this.trackedAircraft.metadata = response.payload;
          const trackCopy = { ...this.trackedAircraft };
          Object.entries(this.aircraftTrackUpdatedSubscriberDictionary).forEach(([key, value]) => {
            try { value(trackCopy); } catch (e) { console.error(`Subscriber ${key} error:`, e); }
          });
        }

        this.isFetchingAircraftData = false;
      })
      .catch((error) => {
        console.error('Aircraft data fetch error:', error);
        this.isFetchingAircraftData = false;
      })
      .finally(() => {

        this.isFetchingAircraftData = false;
        if (this.stopped) return;
        this.fetchAircraftDataIntervalID = window.setTimeout(this.fetchAircraftData, metadataInterval);
      })
  };

  private routeCache = new Map<string, { departureAirport: string | null; arrivalAirport: string | null; timestamp: number }>();

  public fetchRoute = async (icao24: string, stateVector?: IStateVector | null): Promise<{ departureAirport: string | null; arrivalAirport: string | null } | null> => {
    const now = Date.now();
    for (const [key, entry] of this.routeCache) {
      if (now - entry.timestamp >= 300000) this.routeCache.delete(key);
    }
    const cached = this.routeCache.get(icao24);
    if (cached && (now - cached.timestamp) < 300000) {
      return { departureAirport: cached.departureAirport, arrivalAirport: cached.arrivalAirport };
    }

    if (!this.restService) return null;

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const begin = currentTime - 86400;
      const targetURL = `${URL}/flights/aircraft?icao24=${icao24}&begin=${begin}&end=${currentTime}`;
      const response = await this.restService.get<IAircraftFlight[]>(targetURL, this.getRequestInit);

      if (response.payload && Array.isArray(response.payload) && response.payload.length > 0) {
        const isAirborne = stateVector && !stateVector.on_ground;

        let flight: IAircraftFlight;
        if (isAirborne && stateVector?.time_position) {
          const tp = stateVector.time_position;
          flight = response.payload.find((f: IAircraftFlight) =>
            f.firstSeen <= tp && (tp - f.lastSeen) < 600
          ) || response.payload[response.payload.length - 1];
        } else {
          flight = response.payload[response.payload.length - 1];
        }

        const result = {
          departureAirport: flight.estDepartureAirport || null,
          arrivalAirport: flight.estArrivalAirport || null,
        };
        this.routeCache.set(icao24, { ...result, timestamp: Date.now() });
        return result;
      }
    } catch (e) {
      console.warn(`Route fetch failed for ${icao24}:`, e);
    }
    return null;
  };
};