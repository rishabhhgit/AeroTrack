import { useContext, createContext } from 'react';
import { NavigationTypeEnumeration } from '../../navigation/navigationTypes.js';

import type { INavigationElement } from '../../navigation/navigationTypes.js';

export interface NavigationContextType {
  currentViewElement?: INavigationElement;
  currentDialogElement?: INavigationElement;
  currentKey: string;
  navigateByKey: (key: string, type?: NavigationTypeEnumeration) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

export default NavigationContext;
