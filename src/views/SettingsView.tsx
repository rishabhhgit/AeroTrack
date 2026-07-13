import React, { useContext } from 'react';
import { useTheme } from '@mui/material/styles';
import { Box, Typography, FormGroup, FormControl, FormControlLabel, InputLabel, Switch, Select, MenuItem } from '@mui/material';
import { AppContext, SettingKeys } from '../components/infrastructure/AppContext.js';
import { ThemeKeys } from './../styles/index.js';

import type { SelectChangeEvent } from '@mui/material';

const SettingsView: React.FC = () => {
  const theme = useTheme()
  const MONO = '"Space Mono", "Courier New", monospace'
  const BG = theme.palette.background.default
  const CARD_BG = theme.palette.background.paper
  const BORDER = theme.palette.divider
  const MUTED = theme.palette.text.secondary
  const DARK = theme.palette.text.primary
  const YELLOW = theme.palette.secondary.main

  const appContext = useContext(AppContext);

  const pullSetting = (key: string, type: string): boolean => {
    const value = appContext.pullSetting(key);
    if (typeof value === type) return value as boolean;
    return false;
  };

  const handleThemeChange = (e: SelectChangeEvent) => {
    appContext.changeTheme(e.target.value);
  };

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    appContext.pushSetting(e.target.name, e.target.checked);
  };

  const sectionStyle = {
    border: `1px solid ${BORDER}`,
    borderRadius: 0,
    backgroundColor: CARD_BG,
    p: 3,
    mb: 2,
  };

  const labelStyle = {
    fontFamily: MONO,
    fontSize: '0.8rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: 400,
  };

  const headingStyle = {
    fontFamily: MONO,
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: DARK,
    mb: 2,
  };

  return (
    <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: BG, minHeight: 0 }}>
      <Box sx={{ px: { xs: 2, md: 6 }, pt: 4, pb: 4 }}>
        <Typography sx={{
          fontFamily: MONO,
          fontSize: { xs: '1rem', md: '1.2rem' },
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: DARK,
          mb: 3,
        }}>
          Settings
        </Typography>

        <Box sx={sectionStyle}>
          <Typography sx={headingStyle}>App Settings</Typography>
          <FormGroup>
            <FormControl variant="outlined" sx={{ minWidth: 200 }}>
              <InputLabel sx={{ ...labelStyle, '&.Mui-focused': { color: MUTED } }}>Theme</InputLabel>
              <Select
                value={appContext.activeThemeName}
                onChange={handleThemeChange}
                label="Theme"
                sx={{
                  fontFamily: MONO,
                  fontSize: '0.8rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: MUTED },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: YELLOW },
                }}>
                <MenuItem value={ThemeKeys.DarkTheme}>{ThemeKeys.DarkTheme}</MenuItem>
                <MenuItem value={ThemeKeys.LightTheme}>{ThemeKeys.LightTheme}</MenuItem>
                <MenuItem value={ThemeKeys.PineappleTheme}>{ThemeKeys.PineappleTheme}</MenuItem>
                <MenuItem value={ThemeKeys.JetLogTheme}>{ThemeKeys.JetLogTheme}</MenuItem>
              </Select>
            </FormControl>
          </FormGroup>
        </Box>

        <Box sx={sectionStyle}>
          <Typography sx={headingStyle}>Map Settings</Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  name={SettingKeys.EnablePathPrediction}
                  checked={pullSetting(SettingKeys.EnablePathPrediction, 'boolean')}
                  onChange={handleSettingsChange}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: YELLOW },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: YELLOW },
                  }}
                />
              }
              label={<Typography sx={labelStyle}>Enable path prediction</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  name={SettingKeys.ShowDataOverlayOnMap}
                  checked={pullSetting(SettingKeys.ShowDataOverlayOnMap, 'boolean')}
                  onChange={handleSettingsChange}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: YELLOW },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: YELLOW },
                  }}
                />
              }
              label={<Typography sx={labelStyle}>Show data overlay on map</Typography>}
            />
          </FormGroup>
        </Box>
      </Box>
    </Box>
  );
};

export default SettingsView;
