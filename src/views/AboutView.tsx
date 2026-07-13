import React from 'react';
import { Box } from '@mui/material';
import AboutContent from '../components/infrastructure/AboutContent.js';

// Types
import type { IAboutData } from '../components/infrastructure/AboutContent.js';
import type { INavigationElementProps } from '../navigation/navigationTypes.js';

// Icons
import InfoIcon from '@mui/icons-material/Info';

type Props = Record<string, never> & INavigationElementProps;

const AboutView: React.FC<Props> = (_props) => {

  // Data seeding
  const elements: Array<IAboutData> = [
    {
      ariaLabel: 'Info',
      url: '',
      Icon: InfoIcon
    }
  ];

  return (

    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}>

      <AboutContent
        elements={elements} />
    </Box>
  );
}

export default AboutView;
