import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ServiceProvider } from '../../services/infrastructure/serviceProvider.js';
import { AppContext, SettingKeys } from './AppContext.js';
import { ThemeKeys } from '../../styles/index.js';

// Types
import type { IService } from '../../services/infrastructure/serviceTypes.js';

export { SettingKeys } from './AppContext.js';

const getDefaultSettings = () => {
  return {
    [SettingKeys.EnablePathPrediction]: true,
    [SettingKeys.ShowDataOverlayOnMap]: true
  };
};

interface ILocalProps {
  children?: React.ReactNode;
  onThemeChange?: (themeName: string) => void;
  onInjectServices?: () => Array<IService>;
};
type Props = ILocalProps;

const AppContextProvider: React.FC<Props> = (props) => {

  // Refs
  const serviceProviderRef = useRef<ServiceProvider | null>(null);
  const onInjectServicesRef = useRef(props.onInjectServices);
  const onThemeChangeRef = useRef(props.onThemeChange);
  onInjectServicesRef.current = props.onInjectServices;
  onThemeChangeRef.current = props.onThemeChange;

  // Initialize service provider once
  if (!serviceProviderRef.current) {
    serviceProviderRef.current = new ServiceProvider();
  }

  // States
  const [activeThemeName, setActiveThemeName] = useState(() => {
    const defaults = getDefaultSettings();
    return defaults[SettingKeys.EnablePathPrediction] ? ThemeKeys.JetLogTheme : ThemeKeys.DarkTheme;
  });
  const [settingsStorage, setSettingsStorage] = useState<{ [key: string]: unknown }>(getDefaultSettings());

  // Effects
  useEffect(() => {

    // Mount
    if (onInjectServicesRef.current) {
      const servicesToInject = onInjectServicesRef.current();
      servicesToInject.forEach(service => serviceProviderRef.current!.addService(service, service.key));
    }

    serviceProviderRef.current!.startServices();

    // Unmount
    return () => {
      serviceProviderRef.current!.stopServices();
    }
  }, []);

  const handleThemeChange = useCallback((themeName: string) => {
    if (onThemeChangeRef.current)
      onThemeChangeRef.current(themeName);
    setActiveThemeName(themeName);
  }, []);

  const handlePushSetting = useCallback((key: string, value: unknown) => {
    setSettingsStorage(prev => ({ ...prev, [key]: value }));
    return true;
  }, []);

  const settingsStorageRef = useRef(settingsStorage);
  settingsStorageRef.current = settingsStorage;

  const handlePullSetting = useCallback((key: string) => {
    return settingsStorageRef.current[key];
  }, []);

  const contextValue = useMemo(() => ({
    hasConnectionErrors: false,
    activeThemeName,
    getService: serviceProviderRef.current!.getService,
    changeTheme: handleThemeChange,
    pushSetting: handlePushSetting,
    pullSetting: handlePullSetting
  }), [activeThemeName, handleThemeChange, handlePushSetting, handlePullSetting]);

  return (

    <AppContext.Provider value={contextValue}>
      {props.children}
    </AppContext.Provider>
  );
}

export default AppContextProvider;
