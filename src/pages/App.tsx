import React, { Suspense, useState, useEffect, useMemo } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { Box, ThemeProvider, CssBaseline, CircularProgress } from '@mui/material'
import { SnackbarProvider } from 'notistack'
import AppContextProvider from '../components/infrastructure/AppContextProvider.js'
import NavigationProvider from '../components/infrastructure/NavigationProvider.js'
import { navigationElements, getImportableView } from '../navigation/navigationElements.js'
import RouterPage from './RouterPage.js'
import { RESTService } from './../services/restService.js'
import { GeospatialService } from './../services/geospatialService.js'
import { OpenSkyAPIService } from './../services/openSkyAPIService.js'
import { AirportService } from './../services/airportService.js'
import { ServiceKeys } from '../services/serviceKeys.js'
import { ThemeKeys, DarkTheme, LightTheme, PineappleTheme, JetLogTheme } from './../styles/index.js'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js'
import { logger } from '../lib/logger.js'

// Types
import type { IService } from './../services/infrastructure/serviceTypes.js'

// Styles
import 'maplibre-gl/dist/maplibre-gl.css'
import './../styles/app.style.css'

const App: React.FC = () => {
  // States
  const [themeName, setThemeName] = useState(ThemeKeys.JetLogTheme)

  // Keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'ctrl+shift+d': () => {
      setThemeName((prev) => (prev === ThemeKeys.DarkTheme ? ThemeKeys.LightTheme : ThemeKeys.DarkTheme))
      logger.info('Theme toggled via keyboard shortcut', 'App')
    },
  }), []);

  useKeyboardShortcuts(shortcuts)

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister().catch(() => {});
        }
      });
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
  }, [])

  const getTheme = () => {
    switch (themeName) {
      case ThemeKeys.DarkTheme:
        return DarkTheme
      case ThemeKeys.LightTheme:
        return LightTheme
      case ThemeKeys.PineappleTheme:
        return PineappleTheme
      case ThemeKeys.JetLogTheme:
        return JetLogTheme
      default:
        return JetLogTheme
    }
  }

  const handleThemeChange = (themeName: string) => {
    setThemeName(themeName)
  }

  const handleInjectServices = () => {
    const services: Array<IService> = []

    // REST Service
    const restService = new RESTService(ServiceKeys.RESTService)
    services.push(restService)

    // OpenSky API Service
    const openSkyAPIService = new OpenSkyAPIService(
      ServiceKeys.OpenSkyAPIService,
      import.meta.env.VITE_REACT_OSKY_CLIENT_ID,
      import.meta.env.VITE_REACT_OSKY_CLIENT_SECRET
    )
    services.push(openSkyAPIService)

    // Geospatial Service
    const geospatialService = new GeospatialService(ServiceKeys.GeospatialService)
    services.push(geospatialService)

    // Airport Service
    const airportService = new AirportService(ServiceKeys.AirportService)
    services.push(airportService)

    return services
  }

  const renderFallback = () => {
    return (
      <Box
        sx={{
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          alignContent: 'center',
          justifyItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CssBaseline enableColorScheme={true} />
        <CircularProgress color="primary" size={128} />
      </Box>
    )
  }

  return (
    <BrowserRouter>
      <ThemeProvider theme={getTheme()}>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={5000}
        >
          <Suspense fallback={renderFallback()}>
            <AppContextProvider onInjectServices={handleInjectServices} onThemeChange={handleThemeChange}>
              <NavigationProvider
                navigationItems={navigationElements}
                onInject={(navigationElement) => React.lazy(() => getImportableView(navigationElement.importPath))}
              >
                <CssBaseline enableColorScheme={true} />
                <RouterPage />
              </NavigationProvider>
            </AppContextProvider>
          </Suspense>
        </SnackbarProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
