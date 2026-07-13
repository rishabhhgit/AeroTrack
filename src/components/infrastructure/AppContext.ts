import React from 'react';
import { ThemeKeys } from '../../styles/index.js';

import type { IService } from '../../services/infrastructure/serviceTypes.js';

export class SettingKeys {
  public static EnablePathPrediction = 'EnablePathPrediction';
  public static ShowDataOverlayOnMap = 'ShowDataOverlayOnMap';
}

export interface AppContextProps {
  hasConnectionErrors: boolean;
  activeThemeName: string;
  getService: <T extends IService>(serviceKey: string) => T | undefined;
  changeTheme: (themeName: string) => void;
  pushSetting: (key: string, value: unknown) => boolean;
  pullSetting: (key: string) => unknown;
}

export const AppContext = React.createContext<AppContextProps>({
  hasConnectionErrors: false,
  activeThemeName: ThemeKeys.DarkTheme,
  getService: () => undefined,
  changeTheme: (_themeName: string) => { },
  pushSetting: (_key: string, _value: unknown) => false,
  pullSetting: (_key: string) => undefined
});
