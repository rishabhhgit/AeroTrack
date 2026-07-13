import { NavigationTypeEnumeration } from '../navigation/navigationTypes.js'

// Types
import type { INavigationElement } from '../navigation/navigationTypes.js'

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard'
import FlightIcon from '@mui/icons-material/Flight'
import MapIcon from '@mui/icons-material/Map'
import InfoIcon from '@mui/icons-material/Info'
import SettingsIcon from '@mui/icons-material/Settings'
import FavoriteIcon from '@mui/icons-material/Favorite'
import HistoryIcon from '@mui/icons-material/History'
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff'

export class ViewKeys {
  public static DashboardView: string = 'DashboardView'
  public static FlightsTableView: string = 'FlightsTableView'
  public static MapView: string = 'MapView'
  public static SettingsView: string = 'SettingsView'
  public static AboutView: string = 'AboutView'
  public static FavoritesView: string = 'FavoritesView'
  public static RecentlyViewedView: string = 'RecentlyViewedView'
  public static FlightDetailsView: string = 'FlightDetailsView'
}

export const dashboardViewNavigationData: INavigationElement = {
  key: ViewKeys.DashboardView,
  name: 'Dashboard',
  importPath: 'views/DashboardView',
  type: NavigationTypeEnumeration.View,
  Icon: DashboardIcon,
}

export const flightsTableViewNavigationData: INavigationElement = {
  key: ViewKeys.FlightsTableView,
  name: 'Flights',
  importPath: 'views/FlightsTableView',
  type: NavigationTypeEnumeration.View,
  Icon: FlightIcon,
}

export const mapViewNavigationData: INavigationElement = {
  key: ViewKeys.MapView,
  name: 'Map',
  importPath: 'views/MapView',
  type: NavigationTypeEnumeration.View,
  Icon: MapIcon,
}

export const settingsViewNavigationData: INavigationElement = {
  key: ViewKeys.SettingsView,
  name: 'Settings',
  importPath: 'views/SettingsView',
  type: NavigationTypeEnumeration.View,
  Icon: SettingsIcon,
}

export const aboutViewNavigationData: INavigationElement = {
  key: ViewKeys.AboutView,
  name: 'About',
  importPath: 'views/AboutView',
  type: NavigationTypeEnumeration.View,
  Icon: InfoIcon,
}

export const favoritesViewNavigationData: INavigationElement = {
  key: ViewKeys.FavoritesView,
  name: 'Favorites',
  importPath: 'views/FavoritesView',
  type: NavigationTypeEnumeration.View,
  Icon: FavoriteIcon,
}

export const recentlyViewedNavigationData: INavigationElement = {
  key: ViewKeys.RecentlyViewedView,
  name: 'Recent',
  importPath: 'views/RecentlyViewedView',
  type: NavigationTypeEnumeration.View,
  Icon: HistoryIcon,
}

export const flightDetailsNavigationData: INavigationElement = {
  key: ViewKeys.FlightDetailsView,
  name: 'Flight Details',
  importPath: 'views/FlightDetailsView',
  type: NavigationTypeEnumeration.View,
  Icon: FlightTakeoffIcon,
}
