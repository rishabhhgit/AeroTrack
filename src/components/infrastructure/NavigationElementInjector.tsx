import React, { useMemo, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { ErrorBoundary } from './ErrorBoundary.js';
import { ErrorContent } from './ErrorContent.js';

// Types
import type { INavigationElement, INavigationElementProps } from '../../navigation/navigationTypes.js';

interface ILocalProps {
  children?: React.ReactNode;
  navigationElement: INavigationElement | undefined;
  onInject: (navigationElement: INavigationElement) => React.LazyExoticComponent<React.ComponentType<INavigationElementProps>>;
};
type Props = ILocalProps;

const NavigationElementInjector: React.FC<Props> = ({ navigationElement, onInject }) => {

  // Memoized lazy import of a component (hooks must be called unconditionally)
  const GenericNavigationElement = useMemo((): React.LazyExoticComponent<React.ComponentType<INavigationElementProps>> | null => {
    if (navigationElement === null || navigationElement === undefined) return null;
    return onInject(navigationElement);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-memoize when navigation key changes
  }, [navigationElement?.key, onInject]);

  if (!GenericNavigationElement || !navigationElement) return null;

  return (

    <ErrorBoundary
      sourceName={navigationElement.importPath}
      onRenderFallback={(source, error, errorInfo) => {
        return (

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            <ErrorContent
              sourceName={source}
              errorMessage={error && error.toString()}
              stackInfo={errorInfo.componentStack} />
          </Box>
        )
      }}>
      <Suspense
        fallback={

          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              alignContent: 'center',
              justifyItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
            }}>

            <CircularProgress
              color='primary'
              size={64} />
          </Box>
        }>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <GenericNavigationElement />
        </Box>
      </Suspense>
    </ErrorBoundary>
  );
};

export default NavigationElementInjector;
