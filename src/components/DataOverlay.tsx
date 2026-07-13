import React, { useMemo } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import type { IStateVectorData } from '../opensky/types.js';

interface ILocalProps {
  stateVectors: IStateVectorData;
}

const DataOverlay: React.FC<ILocalProps> = (props) => {

  const stats = useMemo(() => {
    const states = props.stateVectors?.states;
    if (!Array.isArray(states)) return { total: 0, airborne: 0, onGround: 0, visible: 0 };

    let airborne = 0;
    let onGround = 0;
    let visible = 0;
    for (const s of states) {
      if (s.latitude == null || s.longitude == null) continue;
      visible++;
      if (s.on_ground) onGround++;
      else airborne++;
    }

    return { total: states.length, airborne, onGround, visible };
  }, [props.stateVectors]);

  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        opacity: 0.95,
        p: 1.5,
        minWidth: 140,
      }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block', mb: 0.5, fontFamily: '"Space Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.8rem' }}>
        Visible Flights
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1, fontFamily: '"Space Mono", monospace' }}>
        {stats.visible.toLocaleString()}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
        <Chip
          label={`${stats.airborne} airborne`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ height: 18, fontSize: '0.75rem' }}
        />
        <Chip
          label={`${stats.onGround} on ground`}
          size="small"
          color="default"
          variant="outlined"
          sx={{ height: 18, fontSize: '0.75rem' }}
        />
      </Box>
    </Box>
  );
};

export default DataOverlay;
