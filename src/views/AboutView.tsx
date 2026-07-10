import React from 'react';
import { Box } from '@mui/material';
import AboutContent from '../components/infrastructure/AboutContent.js';
import { ViewKeys } from './viewKeys.js';

// Types
import type { IAboutData } from '../components/infrastructure/AboutContent.js';
import type { INavigationElementProps } from '../navigation/navigationTypes.js';

// Icons
import InfoIcon from '@mui/icons-material/Info';

interface ILocalProps {
}
type Props = ILocalProps & INavigationElementProps;

const AboutView: React.FC<Props> = (props) => {

  // Fields
  const contextName: string = ViewKeys.AboutView;

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
