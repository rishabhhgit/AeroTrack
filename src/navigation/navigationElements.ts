import React from 'react'
import {
  dashboardViewNavigationData,
  flightsTableViewNavigationData,
  mapViewNavigationData,
  settingsViewNavigationData,
  aboutViewNavigationData,
  favoritesViewNavigationData,
  recentlyViewedNavigationData,
  flightDetailsNavigationData,
} from '../views/viewKeys.js'

// Types
import type { INavigationElement } from './navigationTypes.js'

export const navigationElements: Array<INavigationElement> = [
  dashboardViewNavigationData,
  flightsTableViewNavigationData,
  mapViewNavigationData,
  favoritesViewNavigationData,
  recentlyViewedNavigationData,
  settingsViewNavigationData,
  aboutViewNavigationData,
  flightDetailsNavigationData,
]

export const getImportableView = async (dynamicFilePath: string) => {
  let page: { default: React.ComponentType };

  if (dynamicFilePath === 'views/DashboardView') {
    page = await import('./../views/DashboardView.tsx')
  } else if (dynamicFilePath === 'views/FlightsTableView') {
    page = await import('./../views/FlightsTableView.tsx')
  } else if (dynamicFilePath === 'views/MapView') {
    page = await import('./../views/MapView.tsx')
  } else if (dynamicFilePath === 'views/SettingsView') {
    page = await import('./../views/SettingsView.tsx')
  } else if (dynamicFilePath === 'views/AboutView') {
    page = await import('./../views/AboutView.tsx')
  } else if (dynamicFilePath === 'views/FavoritesView') {
    page = await import('./../views/FavoritesView.tsx')
  } else if (dynamicFilePath === 'views/RecentlyViewedView') {
    page = await import('./../views/RecentlyViewedView.tsx')
  } else if (dynamicFilePath === 'views/FlightDetailsView') {
    page = await import('./../views/FlightDetailsView.tsx')
  } else {
    console.error(`Unknown view path: ${dynamicFilePath}`);
    page = await import('./../views/DashboardView.tsx');
  }

  return page
}
