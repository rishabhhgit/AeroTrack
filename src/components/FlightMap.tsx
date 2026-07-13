import React, { useContext, useRef, useState, useEffect, useCallback } from 'react';
import { Box, useTheme, IconButton, Tooltip } from '@mui/material';
import maplibregl from 'maplibre-gl';
import { AppContext, SettingKeys } from '../components/infrastructure/AppContext.js';
import { ServiceKeys } from '../services/serviceKeys.js';
import { svgToImageAsync } from '../helpers/imageFunctions.js';
import { Constants } from './../maplibre/constants.js';
import { getFormattedValue, getIconName, getRotation, getColor } from '../helpers/aircraftDataFunctions.js';
import AircraftInfoOverlay from './AircraftInfoOverlay.js';
import AirportSearch from './AirportSearch.js';
import FlightSearch from './FlightSearch.js';
import AirportDetailPanel from './AirportDetailPanel.js';
import DataOverlay from './DataOverlay.js';

// Icons
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';

// Types
import type { FeatureCollection, Feature, GeoJsonProperties, Point, Position } from 'geojson';
import type { SymbolLayerSpecification, ExpressionSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import type { IStateVectorData, IAircraftTrack, IAirportData, IMapGeoBounds } from './../opensky/types.js';
import type { IAirportService } from '../services/airportService.js';

// Icons (inline SVG data URIs)
const FlightIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'/%3E%3C/svg%3E";
const FlightLandIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85z'/%3E%3C/svg%3E";
const FlightLandFlippedIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21.5 19h-19v2h19zm-19.57-9.36c.21-.8 1.04-1.28 1.84-1.06L9.08 10l6.9-6.43 1.93.51-4.14 7.17 4.97 1.33 1.97-1.54 1.45.39-2.59 4.49L3 11.49c-.81-.23-1.28-1.05-1.07-1.85z'/%3E%3C/svg%3E";
const FlightTakeoffIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M2.5 19h19v2h-19zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l1.6.43 5.31 1.43z'/%3E%3C/svg%3E";
const FlightTakeoffFlippedIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21.5 19h-19v2h19zm-7.18-5.73l-4.35 1.16-5.31 1.42c-.8.21-1.62-.26-1.84-1.06-.21-.8.26-1.62 1.06-1.84l5.31-1.42 2.76-9.02L13.88 2v8.28l4.97-1.33.93-2.32 1.45-.39v5.17l-1.6.43-5.31 1.43z'/%3E%3C/svg%3E";

interface ILocalProps {
  stateVectors: IStateVectorData;
  selectedAircraft?: IAircraftTrack;
  departureAirport?: IAirportData | null;
  arrivalAirport?: IAirportData | null;
  onMapChange?: (viewState: ViewState, geoBounds: IMapGeoBounds) => void;
  onTrackAircraft?: (icao24: string) => void;
  onReleaseTrack?: (icao24: string) => void;
}
type Props = ILocalProps;

export interface ViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

const aircraftLayerId = 'aircrafts';
const aircraftSourceId = 'aircraft-source';
const airportMarkersSourceId = 'airport-markers-source';
const airportMarkersLayerId = 'airport-markers';
const airportLabelsLayerId = 'airport-labels';
const routeLineSourceId = 'route-line-source';
const routeLineLayerId = 'route-line';

const FlightMap: React.FC<Props> = (props) => {

  // External hooks
  const styleTheme = useTheme();

  // Contexts
  const appContext = useContext(AppContext);
  const airportService = appContext.getService<IAirportService>(ServiceKeys.AirportService);

  // States
  const [selectedAirport, setSelectedAirport] = useState<IAirportData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const geoBoundsTimeoutRef = useRef<number>(0);
  const isUserInteractingRef = useRef<boolean>(false);
  const pendingDataUpdateRef = useRef<boolean>(false);
  const pendingFeatureCollectionRef = useRef<FeatureCollection | null>(null);
  const styleThemeRef = useRef(styleTheme);
  styleThemeRef.current = styleTheme;
  const airportMarkerHandlersRef = useRef<{ click: (e: MapLayerMouseEvent) => void; enter: () => void; leave: () => void } | null>(null);

  // Build GeoJSON FeatureCollection from state vectors
  const createFeatureCollection = useCallback((stateVectors: IStateVectorData, pathPredictions: Array<Feature<Point, GeoJsonProperties>>): FeatureCollection => {

    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };

    for (const stateVector of stateVectors.states) {

      if (stateVector.latitude == null || stateVector.longitude == null) {
        continue;
      }

      const isSelected = props.selectedAircraft
        ? stateVector.icao24 === props.selectedAircraft.icao24
        : false;

      const callsign = stateVector.callsign ? stateVector.callsign : stateVector.icao24;

      let altitude = stateVector.geo_altitude;
      if ((altitude === null) || (altitude < 0))
        altitude = stateVector.baro_altitude;
      if ((altitude === null) || (altitude < 0))
        altitude = 0;

      const velocity = stateVector.velocity ? (stateVector.velocity * 3.6) : -1;
      const trueTrack = stateVector.true_track ? stateVector.true_track : 0.0;
      const verticalRate = stateVector.vertical_rate ? stateVector.vertical_rate : 0.0;
      const isOnGround = stateVector.on_ground;

      let color = getColor(altitude);
      if (isOnGround)
        color = styleThemeRef.current.palette.text.secondary;
      if (isSelected)
        color = styleThemeRef.current.palette.primary.main;

      const properties: GeoJsonProperties = {
        ['iconName']: getIconName(isOnGround, verticalRate, altitude, trueTrack),
        ['rotation']: getRotation(trueTrack, verticalRate, altitude),
        ['color']: color,
        ['isSelected']: isSelected,
        ['icao24']: stateVector.icao24,
        ['callsign']: callsign,
        ['altitude']: getFormattedValue(altitude, 1) + " m",
        ['velocity']: getFormattedValue(velocity, 1) + " km/h"
      };

      let position: Position = [stateVector.longitude, stateVector.latitude];

      if (pathPredictions.length > 0) {
        const feature = pathPredictions.find(f => f.properties?.['icao24'] === stateVector.icao24);
        if (feature)
          position = feature.geometry.coordinates;
      }

      const point: Point = {
        type: 'Point',
        coordinates: position
      };

      const feature: Feature<Point, GeoJsonProperties> = {
        type: 'Feature',
        id: stateVector.icao24,
        geometry: point,
        properties: properties
      };

      featureCollection.features.push(feature);
    }

    return featureCollection;
  }, [props.selectedAircraft]);

  const getSymbolLayout = (zoom: number): SymbolLayerSpecification['layout'] => {

    const showText = zoom > 7;

    let iconSize = 1.0;
    if (zoom > 7) iconSize = 1.3;
    if (zoom > 9) iconSize = 1.6;

    const simpleText: ExpressionSpecification = ["get", "callsign"];
    const detailedText: ExpressionSpecification = [
      'format',
      ["get", "callsign"], { "font-scale": 1.0 },
      "\n", {},
      ["get", "altitude"], { "font-scale": 0.75, "text-color": styleTheme.palette.text.primary },
      "\n", {},
      ["get", "velocity"], { "font-scale": 0.75, "text-color": styleTheme.palette.text.primary }
    ];

    let text: string | ExpressionSpecification = '';
    if (zoom > 7) text = simpleText;
    if (zoom > 9) text = detailedText;

    return {
      "icon-image": ["get", "iconName"],
      "icon-allow-overlap": true,
      "icon-rotate": ["get", "rotation"],
      "icon-size": iconSize,
      "text-field": showText ? text : '',
      "text-optional": true,
      "text-allow-overlap": true,
      "text-anchor": showText ? 'top' : 'center',
      "text-offset": showText ? [0, 1] : [0, 0]
    };
  };

  const getSymbolPaint = (): SymbolLayerSpecification['paint'] => ({
    "icon-color": ["get", "color"],
    "text-color": ["get", "color"],
    "text-halo-width": 2,
    "text-halo-color": styleTheme.palette.background.default,
    "text-halo-blur": 2
  });

  // Add SVG icons to the map
  const addMapSources = (map: maplibregl.Map) => {

    const icons = [
      { name: 'flight-icon', path: FlightIcon },
      { name: 'flight-land-icon', path: FlightLandIcon },
      { name: 'flight-land-flipped-icon', path: FlightLandFlippedIcon },
      { name: 'flight-takeoff-icon', path: FlightTakeoffIcon },
      { name: 'flight-takeoff-flipped-icon', path: FlightTakeoffFlippedIcon }
    ];

    icons.forEach(({ name, path }) => {
      svgToImageAsync(path, 24, 24).then(image => {
        if (!map.hasImage(name))
          map.addImage(name, image, { sdf: true });
      });
    });
  };

  const updateGeoBounds = () => {
    if (!mapRef.current) return;
    const mapBounds = mapRef.current.getBounds();
    if (!mapBounds) return;
    const mapGeoBounds: IMapGeoBounds = {
      northernLatitude: mapBounds.getNorthEast().lat,
      easternLongitude: mapBounds.getNorthEast().lng,
      southernLatitude: mapBounds.getSouthWest().lat,
      westernLongitude: mapBounds.getSouthWest().lng
    };
    if (props.onMapChange) {
      const center = mapRef.current.getCenter();
      props.onMapChange({
        latitude: center.lat,
        longitude: center.lng,
        zoom: mapRef.current.getZoom(),
        bearing: mapRef.current.getBearing(),
        pitch: mapRef.current.getPitch()
      }, mapGeoBounds);
    }
  };

  // Initialize map
  useEffect(() => {

    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleTheme.map.style,
      center: [Constants.DEFAULT_LONGITUDE, Constants.DEFAULT_LATITUDE],
      zoom: Constants.DEFAULT_ZOOM,
      bearing: 0,
      pitch: 0,
      maxZoom: 20,
      minZoom: 0,
      renderWorldCopies: true,
      // Camera control tuning for smoother interaction
      zoomSnap: 0.1,
      dragPan: {
        deceleration: 0.1,
        linearity: 0.3,
        maxSpeed: 1400,
      },
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');
    
    // Tune scroll zoom sensitivity
    map.scrollZoom.setZoomRate(0.05);
    
    // Tune touch controls for mobile
    map.touchZoomRotate.setZoomRate(0.1);
    map.touchZoomRotate.setZoomThreshold(0.2);

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      addMapSources(map);

      // Add aircraft source
      map.addSource(aircraftSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add aircraft layer
      map.addLayer({
        id: aircraftLayerId,
        type: 'symbol',
        source: aircraftSourceId,
        layout: getSymbolLayout(map.getZoom()),
        paint: getSymbolPaint()
      });

      // Click handler for aircraft
      map.on('click', aircraftLayerId, (e) => {
        if (e.features == undefined || e.features.length <= 0)
          return;

        const selectedFeature = e.features[0] as Feature;
        if (selectedFeature.properties) {
          const icao24 = selectedFeature.properties['icao24'] as string;
          if (icao24 && props.onTrackAircraft)
            props.onTrackAircraft(icao24);
        }
      });

      // Change cursor on hover
      map.on('mouseenter', aircraftLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', aircraftLayerId, () => {
        map.getCanvas().style.cursor = '';
      });

      updateGeoBounds();
    });

    map.on('movestart', () => {
      isUserInteractingRef.current = true;
    });

    map.on('move', () => {
      // Debounce geoBounds update — only fire after user stops moving for 300ms
      clearTimeout(geoBoundsTimeoutRef.current);
      geoBoundsTimeoutRef.current = window.setTimeout(() => {
        updateGeoBounds();
      }, 300);
    });

    map.on('moveend', () => {
      isUserInteractingRef.current = false;
      clearTimeout(geoBoundsTimeoutRef.current);
      updateGeoBounds();

      // Flush any deferred data updates
      if (pendingDataUpdateRef.current && pendingFeatureCollectionRef.current) {
        const source = map.getSource(aircraftSourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData(pendingFeatureCollectionRef.current);
        pendingDataUpdateRef.current = false;
        pendingFeatureCollectionRef.current = null;
      }
    });

    mapRef.current = map;

    return () => {
      clearTimeout(geoBoundsTimeoutRef.current);
      if (airportMarkerHandlersRef.current) {
        map.off('click', airportMarkersLayerId, airportMarkerHandlersRef.current.click);
        map.off('mouseenter', airportMarkersLayerId, airportMarkerHandlersRef.current.enter);
        map.off('mouseleave', airportMarkersLayerId, airportMarkerHandlersRef.current.leave);
      }
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Map init runs once; style/theme handled via style.load listener
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

  // Update airport markers and route line when tracked aircraft route changes
  useEffect(() => {

    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // Ensure airport markers source and layers exist
    if (!map.getSource(airportMarkersSourceId)) {
      map.addSource(airportMarkersSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    if (!map.getLayer(airportMarkersLayerId)) {
      map.addLayer({
        id: airportMarkersLayerId,
        type: 'circle',
        source: airportMarkersSourceId,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'selected'], false],
            12,
            9
          ],
          'circle-color': [
            'match', ['get', 'type'],
            'departure', '#4caf50',
            'arrival', '#f44336',
            '#ff5722'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Click handler for airport markers
      const onAirportClick = (e: MapLayerMouseEvent) => {
        if (e.features == undefined || e.features.length <= 0)
          return;

        const selectedFeature = e.features[0] as Feature;
        if (selectedFeature.properties) {
          const icao = selectedFeature.properties['icao'] as string;
          if (icao && airportService) {
            const airport = airportService.getAirport(icao);
            if (airport) {
              setSelectedAirport(airport);
            }
          }
        }
      };

      const onAirportEnter = () => {
        map.getCanvas().style.cursor = 'pointer';
      };
      const onAirportLeave = () => {
        map.getCanvas().style.cursor = '';
      };

      airportMarkerHandlersRef.current = { click: onAirportClick, enter: onAirportEnter, leave: onAirportLeave };
      map.on('click', airportMarkersLayerId, onAirportClick);
      map.on('mouseenter', airportMarkersLayerId, onAirportEnter);
      map.on('mouseleave', airportMarkersLayerId, onAirportLeave);
    }

    if (!map.getLayer(airportLabelsLayerId)) {
      map.addLayer({
        id: airportLabelsLayerId,
        type: 'symbol',
        source: airportMarkersSourceId,
        layout: {
          'text-field': ['get', 'label'],
          'text-anchor': 'top',
          'text-offset': [0, 1.8],
          'text-size': 12,
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-width': 1.5,
          'text-halo-color': '#000000'
        }
      });
    }

    // Ensure route line source and layer exist
    if (!map.getSource(routeLineSourceId)) {
      map.addSource(routeLineSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    if (!map.getLayer(routeLineLayerId)) {
      map.addLayer({
        id: routeLineLayerId,
        type: 'line',
        source: routeLineSourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', 'flown'], false],
            '#4caf50',
            '#ff5722'
          ],
          'line-width': 2.5,
          'line-dasharray': [
            'case',
            ['boolean', ['get', 'flown'], false],
            ['literal', [1, 0]],
            ['literal', [4, 3]]
          ]
        }
      });
    }

    // Build airport markers and route line from route data
    const airportFeatures: Feature[] = [];
    const routeFeatures: Feature[] = [];

    if (props.selectedAircraft?.route && airportService) {
      const route = props.selectedAircraft.route;
      let departureAirport: IAirportData | null = null;
      let arrivalAirport: IAirportData | null = null;

      const addAirportMarker = (icao: string | null, type: string): IAirportData | null => {
        if (!icao) return null;
        const airport = airportService.getAirport(icao);
        if (!airport) return null;

        const feature: Feature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [airport.longitude, airport.latitude]
          },
          properties: {
            icao: icao,
            name: airport.name,
            iata: airport.iata,
            city: airport.city,
            country: airport.country,
            type: type,
            label: `${airport.iata || icao}`,
            markerColor: type === 'departure' ? '#4caf50' : '#f44336',
            markerType: type
          }
        };
        airportFeatures.push(feature);
        return airport;
      };

      departureAirport = addAirportMarker(route.estDepartureAirport, 'departure');
      arrivalAirport = addAirportMarker(route.estArrivalAirport, 'arrival');

      const sv = props.selectedAircraft.stateVector;
      const aircraftLon = sv?.longitude;
      const aircraftLat = sv?.latitude;

      const greatCircleArc = (p1: Position, p2: Position, segments: number): Position[] => {
        const coords: Position[] = [];
        const lat1 = p1[1] * Math.PI / 180;
        const lon1 = p1[0] * Math.PI / 180;
        const lat2 = p2[1] * Math.PI / 180;
        let lon2 = p2[0] * Math.PI / 180;
        
        // Anti-meridian handling: choose the shorter arc
        const dLon = lon2 - lon1;
        if (Math.abs(dLon) > Math.PI) {
          if (dLon > 0) {
            lon2 -= 2 * Math.PI;
          } else {
            lon2 += 2 * Math.PI;
          }
        }
        
        const d = 2 * Math.asin(Math.sqrt(
          Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
        ));
        let prevLon = -999;
        for (let j = 0; j <= segments; j++) {
          const t = j / segments;
          let lonDeg: number, latDeg: number;
          if (d < 0.0001) {
            lonDeg = (lon1 + t * (lon2 - lon1)) * 180 / Math.PI;
            latDeg = (lat1 + t * (lat2 - lat1)) * 180 / Math.PI;
          } else {
            const A = Math.sin((1 - t) * d) / Math.sin(d);
            const B = Math.sin(t * d) / Math.sin(d);
            const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
            const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
            const z = A * Math.sin(lat1) + B * Math.sin(lat2);
            lonDeg = Math.atan2(y, x) * 180 / Math.PI;
            latDeg = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
          }
          // Break the line at anti-meridian crossings
          if (prevLon !== -999 && Math.abs(lonDeg - prevLon) > 180) {
            coords.push([lonDeg > 0 ? -180 : 180, latDeg]);
            coords.push([lonDeg > 0 ? 180 : -180, latDeg]);
          }
          coords.push([lonDeg, latDeg]);
          prevLon = lonDeg;
        }
        return coords;
      };

      if (departureAirport && arrivalAirport && aircraftLon != null && aircraftLat != null) {
        // Find the closest point on the great circle to the aircraft
        const gcCoords = greatCircleArc(
          [departureAirport.longitude, departureAirport.latitude],
          [arrivalAirport.longitude, arrivalAirport.latitude],
          200
        );
        let minDist = Infinity;
        let closestIdx = 0;
        for (let i = 0; i < gcCoords.length; i++) {
          const dx = gcCoords[i][0] - aircraftLon;
          const dy = gcCoords[i][1] - aircraftLat;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) { minDist = dist; closestIdx = i; }
        }

        // Flown path: departure → closest point on arc (solid)
        const flownCoords = gcCoords.slice(0, closestIdx + 1);
        flownCoords.push([aircraftLon, aircraftLat]);
        if (flownCoords.length >= 2) {
          routeFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: flownCoords },
            properties: { flown: true }
          });
        }

        // Remaining path: aircraft → arrival (dashed)
        const remainCoords = [[aircraftLon, aircraftLat] as Position, ...gcCoords.slice(closestIdx)];
        if (remainCoords.length >= 2) {
          routeFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: remainCoords },
            properties: { flown: false }
          });
        }
      } else if (departureAirport && arrivalAirport) {
        // No aircraft position — just draw full great circle
        const gcCoords = greatCircleArc(
          [departureAirport.longitude, departureAirport.latitude],
          [arrivalAirport.longitude, arrivalAirport.latitude],
          100
        );
        if (gcCoords.length >= 2) {
          routeFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: gcCoords },
            properties: { flown: false }
          });
        }
      }
    }

    const airportSource = map.getSource(airportMarkersSourceId) as maplibregl.GeoJSONSource;
    if (airportSource) {
      airportSource.setData({ type: 'FeatureCollection', features: airportFeatures });
    }

    const routeSource = map.getSource(routeLineSourceId) as maplibregl.GeoJSONSource;
    if (routeSource) {
      routeSource.setData({ type: 'FeatureCollection', features: routeFeatures });
    }
  }, [props.selectedAircraft?.route, props.selectedAircraft?.stateVector, airportService]);

  // Update source data when stateVectors or selectedAircraft changes
  // Defer setData during active globe interaction to avoid frame drops
  useEffect(() => {

    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const source = map.getSource(aircraftSourceId) as maplibregl.GeoJSONSource;
    if (!source) return;

    const featureCollection = createFeatureCollection(props.stateVectors, []);

    if (isUserInteractingRef.current) {
      // Defer until moveend
      pendingDataUpdateRef.current = true;
      pendingFeatureCollectionRef.current = featureCollection;
      return;
    }

    source.setData(featureCollection);
  }, [props.stateVectors, props.selectedAircraft, createFeatureCollection]);

  // Update layer styling only when zoom crosses thresholds (7, 9) to avoid setData during pan/zoom
  const lastZoomBucketRef = useRef<number>(0);
  const zoomUpdateRafRef = useRef<number>(0);

  const updateZoomBucket = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const zoom = map.getZoom();
    const bucket = zoom > 9 ? 2 : zoom > 7 ? 1 : 0;
    if (bucket === lastZoomBucketRef.current) return;
    lastZoomBucketRef.current = bucket;

    const theme = styleThemeRef.current;
    if (map.getLayer(aircraftLayerId)) {
      map.setLayoutProperty(aircraftLayerId, 'icon-image', ["get", "iconName"]);
      map.setLayoutProperty(aircraftLayerId, 'icon-allow-overlap', true);
      map.setLayoutProperty(aircraftLayerId, 'icon-rotate', ["get", "rotation"]);
      map.setLayoutProperty(aircraftLayerId, 'icon-size', zoom > 9 ? 1.6 : zoom > 7 ? 1.3 : 1.0);
      map.setLayoutProperty(aircraftLayerId, 'text-optional', true);
      map.setLayoutProperty(aircraftLayerId, 'text-allow-overlap', true);
      map.setLayoutProperty(aircraftLayerId, 'text-anchor', zoom > 7 ? 'top' : 'center');
      map.setLayoutProperty(aircraftLayerId, 'text-offset', zoom > 7 ? [0, 1] : [0, 0]);
      map.setPaintProperty(aircraftLayerId, 'icon-color', ["get", "color"]);
      map.setPaintProperty(aircraftLayerId, 'text-color', ["get", "color"]);
      map.setPaintProperty(aircraftLayerId, 'text-halo-width', 2);
      map.setPaintProperty(aircraftLayerId, 'text-halo-color', theme.palette.background.default);
      map.setPaintProperty(aircraftLayerId, 'text-halo-blur', 2);
      if (zoom > 7) {
        const text = zoom > 9
          ? [
            'format',
            ["get", "callsign"], { "font-scale": 1.0 },
            "\n", {},
            ["get", "altitude"], { "font-scale": 0.75, "text-color": theme.palette.text.primary },
            "\n", {},
            ["get", "velocity"], { "font-scale": 0.75, "text-color": theme.palette.text.primary }
          ] as ExpressionSpecification
          : (["get", "callsign"] as ExpressionSpecification);
        map.setLayoutProperty(aircraftLayerId, 'text-field', text);
      } else {
        map.setLayoutProperty(aircraftLayerId, 'text-field', '');
      }
    }
  }, []);

  // Listen for zoom changes via map events instead of React state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onZoom = () => {
      cancelAnimationFrame(zoomUpdateRafRef.current);
      zoomUpdateRafRef.current = requestAnimationFrame(updateZoomBucket);
    };
    map.on('zoom', onZoom);
    return () => {
      map.off('zoom', onZoom);
      cancelAnimationFrame(zoomUpdateRafRef.current);
    };
  }, [updateZoomBucket]);

  // Update map style when theme changes
  const handleStyleLoadRef = useRef<(() => void) | null>(null);

  useEffect(() => {

    const map = mapRef.current;
    if (!map) return;

    // Remove previous handler to prevent listener accumulation
    if (handleStyleLoadRef.current) {
      map.off('style.load', handleStyleLoadRef.current);
    }

    map.setStyle(styleTheme.map.style);

    // Re-add sources and layers after style change
    const handleStyleLoad = () => {
      mapLoadedRef.current = true;
      map.setProjection({ type: 'globe' });
      addMapSources(map);

      if (!map.getSource(aircraftSourceId)) {
        map.addSource(aircraftSourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer(aircraftLayerId)) {
        map.addLayer({
          id: aircraftLayerId,
          type: 'symbol',
          source: aircraftSourceId,
          layout: getSymbolLayout(map.getZoom()),
          paint: getSymbolPaint()
        });
      }

      // Remove old airport marker listeners before re-adding
      if (airportMarkerHandlersRef.current) {
        map.off('click', airportMarkersLayerId, airportMarkerHandlersRef.current.click);
        map.off('mouseenter', airportMarkersLayerId, airportMarkerHandlersRef.current.enter);
        map.off('mouseleave', airportMarkersLayerId, airportMarkerHandlersRef.current.leave);
      }

      // Re-add airport markers source and layers
      if (!map.getSource(airportMarkersSourceId)) {
        map.addSource(airportMarkersSourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer(airportMarkersLayerId)) {
        map.addLayer({
          id: airportMarkersLayerId,
          type: 'circle',
          source: airportMarkersSourceId,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['get', 'selected'], false],
              12,
              9
            ],
            'circle-color': [
              'match', ['get', 'type'],
              'departure', '#4caf50',
              'arrival', '#f44336',
              '#ff5722'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });

        // Click handler for airport markers
        const onAirportClick = (e: MapLayerMouseEvent) => {
          if (e.features == undefined || e.features.length <= 0)
            return;

          const selectedFeature = e.features[0] as Feature;
          if (selectedFeature.properties) {
            const icao = selectedFeature.properties['icao'] as string;
            if (icao && airportService) {
              const airport = airportService.getAirport(icao);
              if (airport) {
                setSelectedAirport(airport);
              }
            }
          }
        };

        const onAirportEnter = () => {
          map.getCanvas().style.cursor = 'pointer';
        };
        const onAirportLeave = () => {
          map.getCanvas().style.cursor = '';
        };

        airportMarkerHandlersRef.current = { click: onAirportClick, enter: onAirportEnter, leave: onAirportLeave };
        map.on('click', airportMarkersLayerId, onAirportClick);
        map.on('mouseenter', airportMarkersLayerId, onAirportEnter);
        map.on('mouseleave', airportMarkersLayerId, onAirportLeave);
      }

      if (!map.getLayer(airportLabelsLayerId)) {
        map.addLayer({
          id: airportLabelsLayerId,
          type: 'symbol',
          source: airportMarkersSourceId,
          layout: {
            'text-field': ['get', 'label'],
            'text-anchor': 'top',
            'text-offset': [0, 1.8],
            'text-size': 12,
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-halo-color': '#000000'
          }
        });
      }

      // Re-add route line source and layer
      if (!map.getSource(routeLineSourceId)) {
        map.addSource(routeLineSourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer(routeLineLayerId)) {
        map.addLayer({
          id: routeLineLayerId,
          type: 'line',
          source: routeLineSourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': [
              'case',
              ['boolean', ['get', 'flown'], false],
              '#4caf50',
              '#ff5722'
            ],
            'line-width': 2.5,
            'line-dasharray': [
              'case',
              ['boolean', ['get', 'flown'], false],
              ['literal', [1, 0]],
              ['literal', [4, 3]]
            ]
          }
        });
      }

      const featureCollection = createFeatureCollection(props.stateVectors, []);
      const source = map.getSource(aircraftSourceId) as maplibregl.GeoJSONSource;
      if (source) source.setData(featureCollection);
    };

    handleStyleLoadRef.current = handleStyleLoad;
    map.on('style.load', handleStyleLoad);
    return () => {
      map.off('style.load', handleStyleLoad);
      handleStyleLoadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Re-init layers only on actual style change
  }, [styleTheme.map.style]);

  // Get settings
  const showDataOverlayOnMap = appContext.pullSetting(SettingKeys.ShowDataOverlayOnMap);

  const handleAirportSelect = (airport: IAirportData) => {

    const map = mapRef.current;
    if (!map) return;

    // Fly to the airport location
    map.flyTo({
      center: [airport.longitude, airport.latitude],
      zoom: 10,
      duration: 3500,
      curve: 1.0,
      essential: true
    });
  };

  const handleFlightSelect = (icao24: string) => {

    const map = mapRef.current;
    if (!map) return;

    // Track the flight
    if (props.onTrackAircraft) {
      props.onTrackAircraft(icao24);
    }
  };

  const handleFlyTo = (lat: number, lng: number) => {

    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [lng, lat],
      zoom: 8,
      duration: 3500,
      curve: 1.0,
      essential: true
    });
  };

  const handleCloseAirportDetail = () => {
    setSelectedAirport(null);
  };

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  return (

    <Box
      style={{
        width: '100%',
        height: '100%',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        backgroundColor: isFullscreen ? '#000' : 'transparent'
      }}>

      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%'
        }} />

      {/* Fullscreen toggle */}
      <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        <IconButton
          onClick={handleToggleFullscreen}
          size="small"
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 200,
            backgroundColor: 'rgba(255,255,255,0.9)',
            '&:hover': { backgroundColor: '#fff' }
          }}>
          {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
        </IconButton>
      </Tooltip>

      <Box
        className="search-container"
        sx={{
          position: 'absolute',
          top: 16,
          left: { xs: 8, sm: 64 },
          right: { xs: 8, sm: 'auto' },
          zIndex: 200,
          display: 'flex',
          gap: { xs: 0.5, sm: 1 },
          flexWrap: 'wrap',
        }}
        style={{ pointerEvents: 'auto' }}>
        <AirportSearch onAirportSelect={handleAirportSelect} />
        <FlightSearch
          stateVectors={props.stateVectors}
          onFlightSelect={handleFlightSelect}
          onFlyTo={handleFlyTo} />
      </Box>

      {showDataOverlayOnMap &&
        <Box
          sx={{
            position: 'absolute',
            bottom: { xs: 12, sm: 48 },
            right: { xs: 8, sm: 50 }
          }}>
          <DataOverlay
            stateVectors={props.stateVectors} />
        </Box>
      }

      {props.selectedAircraft &&
        <Box
          className="flight-info-overlay"
          sx={{
            position: 'absolute',
            bottom: { xs: 12, sm: 48 },
            left: 0,
            right: { xs: 8, sm: 0 },
            padding: { xs: '6px', sm: '10px' }
          }}>

          <AircraftInfoOverlay
            selectedAircraft={props.selectedAircraft}
            departureAirport={props.departureAirport}
            arrivalAirport={props.arrivalAirport}
            onRelease={props.onReleaseTrack} />
        </Box>
      }

      {selectedAirport &&
        <Box className="airport-detail-panel">
          <AirportDetailPanel
            airport={selectedAirport}
            onClose={handleCloseAirportDetail} />
        </Box>
      }
    </Box>
  );
}

export default FlightMap;
