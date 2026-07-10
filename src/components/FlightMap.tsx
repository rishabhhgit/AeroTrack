import React, { useContext, useRef, useState, useEffect, useCallback } from 'react';
import { Box, useTheme } from '@mui/material';
import maplibregl from 'maplibre-gl';
import { AppContext, SettingKeys } from '../components/infrastructure/AppContextProvider.js';
import { svgToImageAsync } from '../helpers/imageFunctions.js';
import { Constants } from './../maplibre/constants.js';
import { getFormattedValue, getIconName, getRotation, getColor } from '../helpers/aircraftDataFunctions.js';
import AircraftInfoOverlay from './AircraftInfoOverlay.js';
import AirportSearch from './AirportSearch.js';
import FlightSearch from './FlightSearch.js';
import AirportDetailPanel from './AirportDetailPanel.js';
import DataOverlay from './DataOverlay.js';

// Types
import type { FeatureCollection, Feature, GeoJsonProperties, Point, Position, Feature as GeoFeature } from 'geojson';
import type { SymbolLayerSpecification, ExpressionSpecification } from 'maplibre-gl';
import type { IStateVectorData, IAircraftTrack, IAirportData, IMapGeoBounds } from './../opensky/types.js';
import type { IAirportService } from '../services/airportService.js';

// Icons
import FlightIcon from './../resources/flight-24px.svg';
import FlightLandIcon from './../resources/flight_land-24px.svg';
import FlightLandFlippedIcon from './../resources/flight_land-24px_flippedx.svg';
import FlightTakeoffIcon from './../resources/flight_takeoff-24px.svg';
import FlightTakeoffFlippedIcon from './../resources/flight_takeoff-24px_flippedx.svg';

interface ILocalProps {
  stateVectors: IStateVectorData;
  selectedAircraft?: IAircraftTrack;
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
  const airportService = appContext.getService<IAirportService>('AirportService');

  // States
  const [viewState, setViewState] = useState<ViewState>({
    latitude: Constants.DEFAULT_LATITUDE,
    longitude: Constants.DEFAULT_LONGITUDE,
    zoom: Constants.DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0
  });
  const [selectedAirport, setSelectedAirport] = useState<IAirportData | null>(null);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const geoBoundsTimeoutRef = useRef<number>(0);
  const lastViewStateUpdateRef = useRef<number>(0);
  const styleThemeRef = useRef(styleTheme);
  styleThemeRef.current = styleTheme;

  const getDefaultViewState = (): ViewState => ({
    latitude: Constants.DEFAULT_LATITUDE,
    longitude: Constants.DEFAULT_LONGITUDE,
    zoom: Constants.DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0
  });

  // Build GeoJSON FeatureCollection from state vectors
  const createFeatureCollection = useCallback((stateVectors: IStateVectorData, pathPredictions: Array<Feature<Point, GeoJsonProperties>>): FeatureCollection => {

    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    };

    for (const stateVector of stateVectors.states) {

      if (!stateVector.latitude || !stateVector.longitude) {
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
        const feature = pathPredictions.find(f => f.properties !== null && f.properties['icao24']! === stateVector.icao24);
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

    let isconSize = 1.0;
    if (zoom > 7) isconSize = 1.3;
    if (zoom > 9) isconSize = 1.6;

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
      "icon-size": isconSize,
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

  const getMapGeoBounds = (): IMapGeoBounds => {

    const mapGeoBounds: IMapGeoBounds = {
      northernLatitude: 0.0,
      easternLongitude: 0.0,
      southernLatitude: 0.0,
      westernLongitude: 0.0
    };

    if (mapRef.current) {
      const mapBounds = mapRef.current.getBounds();
      if (!mapBounds)
        return mapGeoBounds;

      mapGeoBounds.northernLatitude = mapBounds.getNorthEast().lat;
      mapGeoBounds.easternLongitude = mapBounds.getNorthEast().lng;
      mapGeoBounds.southernLatitude = mapBounds.getSouthWest().lat;
      mapGeoBounds.westernLongitude = mapBounds.getSouthWest().lng;
    }

    return mapGeoBounds;
  };

  const updateGeoBounds = () => {
    const mapGeoBounds = getMapGeoBounds();
    if (props.onMapChange)
      props.onMapChange(viewState, mapGeoBounds);
  };

  // Initialize map
  useEffect(() => {

    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleTheme.map.style,
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      bearing: viewState.bearing,
      pitch: viewState.pitch,
      maxZoom: 20,
      minZoom: 0
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

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

    map.on('move', () => {
      const center = map.getCenter();

      // Throttle React state updates to max 10fps during continuous zoom/pan
      const now = Date.now();
      if (now - lastViewStateUpdateRef.current > 100) {
        lastViewStateUpdateRef.current = now;
        setViewState({
          latitude: center.lat,
          longitude: center.lng,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch()
        });
      }

      // Debounce geoBounds update — only fire after user stops moving for 400ms
      clearTimeout(geoBoundsTimeoutRef.current);
      geoBoundsTimeoutRef.current = window.setTimeout(() => {
        updateGeoBounds();
      }, 400);
    });

    map.on('moveend', () => {
      clearTimeout(geoBoundsTimeoutRef.current);
      updateGeoBounds();
    });

    mapRef.current = map;

    return () => {
      clearTimeout(geoBoundsTimeoutRef.current);
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
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
          'circle-radius': 8,
          'circle-color': '#ff5722',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Click handler for airport markers
      map.on('click', airportMarkersLayerId, (e) => {
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
      });

      // Change cursor on hover for airport markers
      map.on('mouseenter', airportMarkersLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', airportMarkersLayerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    if (!map.getLayer(airportLabelsLayerId)) {
      map.addLayer({
        id: airportLabelsLayerId,
        type: 'symbol',
        source: airportMarkersSourceId,
        layout: {
          'text-field': ['get', 'label'],
          'text-anchor': 'top',
          'text-offset': [0, 1.5],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-width': 1,
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
    const airportFeatures: GeoFeature[] = [];
    const routeFeatures: GeoFeature[] = [];

    if (props.selectedAircraft?.route && airportService) {
      const route = props.selectedAircraft.route;
      let departureAirport: IAirportData | null = null;
      let arrivalAirport: IAirportData | null = null;

      const addAirportMarker = (icao: string | null, type: string): IAirportData | null => {
        if (!icao) return null;
        const airport = airportService.getAirport(icao);
        if (!airport) return null;

        const feature: GeoFeature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [airport.longitude, airport.latitude]
          },
          properties: {
            icao: icao,
            name: airport.name,
            iata: airport.iata,
            type: type,
            label: airport.iata || icao
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
        const lon2 = p2[0] * Math.PI / 180;
        const d = 2 * Math.asin(Math.sqrt(
          Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
        ));
        for (let j = 0; j <= segments; j++) {
          const t = j / segments;
          if (d < 0.0001) {
            coords.push([
              (lon1 + t * (lon2 - lon1)) * 180 / Math.PI,
              (lat1 + t * (lat2 - lat1)) * 180 / Math.PI
            ]);
            continue;
          }
          const A = Math.sin((1 - t) * d) / Math.sin(d);
          const B = Math.sin(t * d) / Math.sin(d);
          const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
          const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
          const z = A * Math.sin(lat1) + B * Math.sin(lat2);
          coords.push([
            Math.atan2(y, x) * 180 / Math.PI,
            Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI
          ]);
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
  useEffect(() => {

    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const source = map.getSource(aircraftSourceId) as maplibregl.GeoJSONSource;
    if (!source) return;

    const featureCollection = createFeatureCollection(props.stateVectors, []);
    source.setData(featureCollection);
  }, [props.stateVectors, props.selectedAircraft, createFeatureCollection]);

  // Update layer styling only when zoom crosses thresholds (7, 9) to avoid setData during pan/zoom
  const lastZoomBucketRef = useRef<number>(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const zoom = viewState.zoom;
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
  }, [viewState.zoom]);

  // Update map style when theme changes
  useEffect(() => {

    const map = mapRef.current;
    if (!map) return;

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
            'circle-radius': 8,
            'circle-color': '#ff5722',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });

        // Click handler for airport markers
        map.on('click', airportMarkersLayerId, (e) => {
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
        });

        // Change cursor on hover for airport markers
        map.on('mouseenter', airportMarkersLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', airportMarkersLayerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      if (!map.getLayer(airportLabelsLayerId)) {
        map.addLayer({
          id: airportLabelsLayerId,
          type: 'symbol',
          source: airportMarkersSourceId,
          layout: {
            'text-field': ['get', 'label'],
            'text-anchor': 'top',
            'text-offset': [0, 1.5],
            'text-size': 12
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-width': 1,
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

    map.on('style.load', handleStyleLoad);
    return () => {
      map.off('style.load', handleStyleLoad);
    };
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
      duration: 1500
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
      duration: 1500
    });
  };

  const handleCloseAirportDetail = () => {
    setSelectedAirport(null);
  };

  return (

    <Box
      style={{
        width: '100%',
        height: '100%',
        position: 'relative'
      }}>

      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%'
        }} />

      <Box
        sx={{
          position: 'absolute',
          top: 16,
          left: 64,
          zIndex: 200,
          pointerEvents: 'auto',
          display: 'flex',
          gap: 1
        }}>
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
            bottom: 48,
            right: 50
          }}>
          <DataOverlay
            stateVectors={props.stateVectors} />
        </Box>
      }

      {props.selectedAircraft &&
        <Box
          sx={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            padding: '10px'
          }}>

          <AircraftInfoOverlay
            selectedAircraft={props.selectedAircraft}
            onRelease={props.onReleaseTrack} />
        </Box>
      }

      {selectedAirport &&
        <AirportDetailPanel
          airport={selectedAirport}
          onClose={handleCloseAirportDetail} />
      }
    </Box>
  );
}

export default FlightMap;
export { aircraftLayerId };
