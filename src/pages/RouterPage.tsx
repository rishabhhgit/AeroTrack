import React, { useEffect, useState, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Typography, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, useTheme, useMediaQuery, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { useNavigation } from '../components/infrastructure/NavigationContext.js';
import { navigationElements } from '../navigation/navigationElements.js';
import { ViewKeys } from '../views/viewKeys.js';
import StartPage from './StartPage.js';
import ErrorPage from './ErrorPage.js';

// Types
import type { INavigationElement } from '../navigation/navigationTypes.js';

// Icons
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FlightIcon from '@mui/icons-material/Flight';
import MapIcon from '@mui/icons-material/Map';
import FavoriteIcon from '@mui/icons-material/Favorite';
import HistoryIcon from '@mui/icons-material/History';

type Props = Record<string, never>;

const getNavIcon = (key: string) => {
  switch (key) {
    case ViewKeys.DashboardView: return <DashboardIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.FlightsTableView: return <FlightIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.MapView: return <MapIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.FavoritesView: return <FavoriteIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.RecentlyViewedView: return <HistoryIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.SettingsView: return <SettingsIcon sx={{ fontSize: 18 }} />;
    case ViewKeys.AboutView: return <InfoIcon sx={{ fontSize: 18 }} />;
    default: return <DashboardIcon sx={{ fontSize: 18 }} />;
  }
};

const RouterPage: React.FC<Props> = (_props) => {

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { navigateByKey, currentKey } = useNavigation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [istTime, setIstTime] = useState('');

  useEffect(() => {
    navigateByKey(ViewKeys.DashboardView);
  }, [navigateByKey]);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const mainTabs = useMemo(() => {
    return navigationElements.filter(el =>
      [ViewKeys.DashboardView, ViewKeys.FlightsTableView, ViewKeys.MapView].includes(el.key)
    );
  }, []);

  const moreMenuItems = useMemo(() => {
    if (isMobile) return navigationElements;
    return navigationElements.filter(el =>
      ![ViewKeys.DashboardView, ViewKeys.FlightsTableView, ViewKeys.MapView].includes(el.key)
    );
  }, [isMobile]);

  const handleMenuButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setMenuAnchor(menuAnchor ? null : e.currentTarget);
  };

  const handleMenuSelect = (element: INavigationElement) => {
    setMenuAnchor(null);
    navigateByKey(element.key);
  };

  return (

    <Box
      sx={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
      }}>

      {/* Top Header Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 3 },
          py: 0,
          height: 48,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: theme.palette.background.paper,
          flexShrink: 0,
        }}>

        {/* Left: Logo + Nav Tabs */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 1 : 2 }}>
          <Typography
            variant="h6"
            sx={{
              cursor: 'pointer',
              lineHeight: 1,
              '&:hover': { opacity: 0.8 },
              transition: 'opacity 0.15s',
              fontSize: isMobile ? '1rem' : undefined,
            }}
            onClick={() => navigateByKey(ViewKeys.DashboardView)}>
            AERO<span style={{ color: theme.palette.secondary.main }}>TRACK</span>
          </Typography>

          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: 'text.secondary',
                  mx: 0.5,
                  cursor: 'default',
                }}>/</Typography>

              {mainTabs.map((tab) => (
                <Box
                  key={tab.key}
                  onClick={() => navigateByKey(tab.key)}
                  sx={{
                    px: 1,
                    py: 0.5,
                    cursor: 'pointer',
                    borderRadius: 1,
                    fontSize: '0.85rem',
                    fontFamily: '"Space Mono", "Courier New", monospace',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: currentKey === tab.key ? 700 : 400,
                    color: currentKey === tab.key ? 'text.primary' : 'text.secondary',
                    backgroundColor: currentKey === tab.key ? 'action.selected' : 'transparent',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      color: 'text.primary',
                    },
                  }}>
                  {tab.name.toUpperCase()}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Right: UTC Time + Menu */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
            IST {istTime}
          </Typography>
          <IconButton
            size="small"
            onClick={handleMenuButtonClick}
            sx={{ p: 0.5 }}>
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          '& > *': { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' },
        }}>

        <Routes>
          <Route
            path="/"
            element={<Navigate replace to="/start" />} />
          <Route
            path="/start"
            element={<StartPage />} />
          <Route
            path="/error"
            element={<ErrorPage />} />
        </Routes>
      </Box>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <BottomNavigation
          showLabels
          value={currentKey}
          onChange={(_, newValue) => {
            if (newValue && newValue !== 'more') navigateByKey(newValue);
          }}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            backgroundColor: theme.palette.background.paper,
            height: 56,
            flexShrink: 0,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 'auto',
              py: 0.75,
              transition: 'color 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&.Mui-selected': {
                color: 'secondary.main',
              },
            },
            '& .MuiBottomNavigationAction-label': {
              fontFamily: '"Space Mono", monospace',
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              mt: 0.25,
              transition: 'font-size 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&.Mui-selected': {
                fontSize: '0.65rem',
                fontWeight: 700,
              },
            },
          }}
        >
          {mainTabs.map((tab) => (
            <BottomNavigationAction
              key={tab.key}
              label={tab.name}
              value={tab.key}
              icon={getNavIcon(tab.key)}
            />
          ))}
        </BottomNavigation>
      )}

      {/* Dropdown Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{
          sx: {
            mt: 0.5,
            minWidth: 180,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }
        }}>
        {moreMenuItems.map((element) => (
          <MenuItem
            key={element.key}
            onClick={() => handleMenuSelect(element)}
            sx={{
              py: 1,
              '&:hover': { backgroundColor: 'action.hover' },
            }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
              {getNavIcon(element.key)}
            </ListItemIcon>
            <ListItemText
              primary={element.name}
              primaryTypographyProps={{
                sx: {
                  fontFamily: '"Space Mono", monospace',
                  fontSize: '0.95rem',
                  letterSpacing: '0.04em',
                }
              }}
            />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export default RouterPage;
