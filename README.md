# AeroTrack

A real-time flight tracking application that visualizes live air traffic on an interactive map using data from the OpenSky Network.

## Features

- **Live Flight Tracking** — Real-time aircraft positions with altitude, velocity, and heading
- **Airport Database** — 9,852 airports with ICAO/IATA codes, search by name, city, or code
- **Airport Markers** — Departure and arrival airports displayed as markers on the map
- **Route Lines** — Dashed route lines from departure to arrival via current position
- **Airport Detail Panel** — Click any airport marker to view runways, frequencies, and elevation
- **Enriched Airport Data** — Live data from AirportDB API (runways, frequencies, navaids)
- **Airport Search** — Search bar to find airports by ICAO, IATA, or name and fly to them
- **Aircraft Info Overlay** — Detailed flight data including altitude, velocity, squawk, and status
- **Multiple Map Themes** — Dark, Light, and Pineapple themes
- **Responsive UI** — Material UI components with clean design

## Tech Stack

| Library | Purpose |
|---------|---------|
| [React 19](https://react.dev/) | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [MapLibre GL JS](https://maplibre.org/) | Free, open-source map renderer |
| [MUI](https://mui.com/) | Material UI components |
| [Vite](https://vitejs.dev/) | Build tool and dev server |
| [OpenSky Network](https://opensky-network.org/) | Live flight data API |
| [AirportDB](https://airportdb.io/) | Enriched airport data (runways, frequencies) |
| [OurAirports](https://ourairports.com/) | Static airport database |

## Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenSky Network account (optional, for lower latency)

## Installation

```bash
git clone https://github.com/your-username/react-flight-tracker.git
cd react-flight-tracker
npm install
```

## Environment Variables

Create a `.env.local` file in the root directory:

```env
# OpenSky Network API (required for flight data)
VITE_REACT_OSKY_CLIENT_ID=your_client_id
VITE_REACT_OSKY_CLIENT_SECRET=your_client_secret

# AirportDB API (required for enriched airport data)
VITE_AIRPORTDB_TOKEN=your_airportdb_token
```

### Getting API Keys

1. **OpenSky Network** — Register at [opensky-network.org](https://opensky-network.org/) and create an API client to get your Client ID and Secret. Without an account, data delay is ~12 seconds; with an account, it's ~6 seconds.

2. **AirportDB** — Get a free API token at [airportdb.io](https://airportdb.io/) for enriched airport data (runways, frequencies, navaids).

## Usage

```bash
# Start development server (runs both Vite and token proxy)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173`.

## Project Structure

```
react-flight-tracker/
├── src/
│   ├── components/          # React components
│   │   ├── FlightMap.tsx           # Main map with aircraft layer
│   │   ├── AircraftInfoOverlay.tsx # Flight info panel
│   │   ├── AirportDetailPanel.tsx  # Airport detail (runways, frequencies)
│   │   ├── AirportSearch.tsx       # Airport search bar
│   │   └── DataOverlay.tsx         # Live data statistics
│   ├── services/            # Business logic
│   │   ├── openSkyAPIService.ts    # OpenSky API polling
│   │   ├── airportService.ts       # Airport lookup + enrichment
│   │   ├── airportDbService.ts     # AirportDB API client
│   │   └── restService.ts          # HTTP client
│   ├── opensky/             # OpenSky types and proxy
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── constants.ts            # API URLs
│   │   └── opensky-token-proxy.ts  # OAuth2 token proxy
│   ├── data/                # Static data
│   │   └── airports.json           # 9,852 airports from OurAirports
│   ├── maplibre/            # Map configuration
│   │   └── constants.ts            # Default map center/zoom
│   ├── styles/              # Theme files
│   │   ├── darkTheme.ts
│   │   ├── lightTheme.ts
│   │   └── pineappleTheme.ts
│   ├── views/               # Page components
│   │   ├── MapView.tsx
│   │   ├── SettingsView.tsx
│   │   └── AboutView.tsx
│   └── helpers/             # Utility functions
├── scripts/
│   └── build-airports.js    # Generate airports.json from OurAirports CSV
├── public/
└── dist/                    # Production build output
```

## How It Works

1. **Aircraft Polling** — The app polls OpenSky Network every 5-10 seconds for aircraft positions within the current map bounds
2. **Route Resolution** — When you click an aircraft, it fetches the flight route (departure/arrival airports) from OpenSky
3. **Airport Enrichment** — Departure and arrival airports are enriched with runway and frequency data from AirportDB API
4. **Map Visualization** — Aircraft are rendered as SVG icons with altitude-based coloring; airports as orange markers with IATA labels
5. **Token Proxy** — A lightweight Express server handles OAuth2 token exchange for OpenSky authentication, keeping credentials server-side

## License

MIT

---

Created by: **rishabhh jain**
