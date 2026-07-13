import React, { useState, useCallback } from 'react';
import { NavigationTypeEnumeration } from '../../navigation/navigationTypes.js';
import NavigationContext from './NavigationContext.js';
import NavigationElementDialog from './NavigationElementDialog.js';

// Types
import type { INavigationElement, INavigationElementProps } from '../../navigation/navigationTypes.js';



export interface NavigationProviderProps {
  navigationItems: Array<INavigationElement>;
  onInject: (navigationElement: INavigationElement) => React.LazyExoticComponent<React.ComponentType<INavigationElementProps>>;
  children?: React.ReactNode;
};

const NavigationProvider: React.FC<NavigationProviderProps> = (props) => {

  // States
  const [currentViewElement, setCurrentViewElement] = useState<INavigationElement | undefined>(undefined);
  const [currentDialogElement, setCurrentDialogElement] = useState<INavigationElement | undefined>(undefined);
  const [currentKey, setCurrentKey] = useState<string>('');

  const navigateByKey = useCallback((key: string, type?: NavigationTypeEnumeration) => {

    const navigationItem = props.navigationItems.find(item => item.key === key);
    if (!navigationItem) {
      console.warn(`Navigation item with key "${key}" not found.`);
      return;
    }

    if (type === undefined) {
      type = navigationItem.type;
    }

    if (type === NavigationTypeEnumeration.View) {
      setCurrentViewElement(navigationItem);
      setCurrentKey(key);
    } else if (type === NavigationTypeEnumeration.Dialog) {
      setCurrentDialogElement(navigationItem);
    }
  }, [props.navigationItems]);

  return (
    <React.Fragment>

      <NavigationContext.Provider value={{ currentViewElement, currentDialogElement, currentKey, navigateByKey }}>
        {props.children}
      </NavigationContext.Provider>

      <NavigationElementDialog
        isVisible={currentDialogElement !== undefined}
        navigationElement={currentDialogElement}
        onInject={props.onInject}
        onClose={() => setCurrentDialogElement(undefined)} />

    </React.Fragment>
  );
};

export default NavigationProvider;
