import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigation } from '../components/infrastructure/NavigationContext.js';
import NavigationElementInjector from '../components/infrastructure/NavigationElementInjector.js';
import { getImportableView } from '../navigation/navigationElements.js';

import type { INavigationElement } from '../navigation/navigationTypes.js';

type Props = Record<string, never>;

const StartPage: React.FC<Props> = (_props) => {

  // Hooks
  const { currentViewElement } = useNavigation();

  const handleInject = useCallback(
    (navigationElement: INavigationElement) => React.lazy(() => getImportableView(navigationElement.importPath)),
    []
  );

  if (currentViewElement === null || currentViewElement === undefined)
    return null;

  return (

    <Box
      sx={{
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        userSelect: 'none'
      }}>

      <NavigationElementInjector
        navigationElement={currentViewElement}
        onInject={handleInject} />

    </Box>
  );
}

export default StartPage;
