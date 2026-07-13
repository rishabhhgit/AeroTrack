import React from 'react'
import { useTheme } from '@mui/material/styles'
import { Box, Typography, List, ListItem, ListItemText, Chip } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useAppStore } from '../store/useStore.js'
import FavoriteButton from '../components/FavoriteButton.js'

const RecentlyViewedView: React.FC = () => {
  const theme = useTheme()
  const MONO = '"Space Mono", "Courier New", monospace'
  const BG = theme.palette.background.default
  const CARD_BG = theme.palette.background.paper
  const BORDER = theme.palette.divider
  const MUTED = theme.palette.text.secondary
  const DARK = theme.palette.text.primary

  const { recentlyViewed } = useAppStore()

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
          Recently Viewed Flights
        </Typography>

        {recentlyViewed.length === 0 ? (
          <Box sx={{
            p: 6,
            textAlign: 'center',
            border: `1px solid ${BORDER}`,
            borderRadius: 0,
            backgroundColor: CARD_BG,
          }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED, mb: 1 }}>
              No recently viewed flights
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED }}>
              Start tracking flights to see them here
            </Typography>
          </Box>
        ) : (
          <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 0, backgroundColor: CARD_BG }}>
            <List disablePadding>
              {recentlyViewed.map((track, index) => {
                const dep = track.route?.estDepartureAirport
                const arr = track.route?.estArrivalAirport
                const sv = track.stateVector

                return (
                  <ListItem
                    key={track.icao24}
                    disablePadding
                    className="table-row"
                    sx={{ borderBottom: index < recentlyViewed.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                  >
                    <ListItemText
                      sx={{ px: 2.5, py: 2 }}
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                          <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '1.05rem', color: DARK }}>
                            {track.callsign?.trim() || track.icao24}
                          </Typography>
                          {(dep || arr) && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '1.0rem', color: DARK }}>{dep || ''}</Typography>
                              {dep && arr && <ArrowForwardIcon sx={{ fontSize: 14, color: MUTED }} />}
                              <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '1.0rem', color: DARK }}>{arr || ''}</Typography>
                            </Box>
                          )}
                          <Chip
                            label={sv?.on_ground ? 'GROUND' : 'AIRBORNE'}
                            size="small"
                            sx={{
                              height: 20, fontSize: '0.9rem', fontFamily: MONO, fontWeight: 600,
                              backgroundColor: 'transparent', border: `1px solid ${BORDER}`,
                              color: sv?.on_ground ? MUTED : '#d4a017', borderRadius: 0,
                              '& .MuiChip-label': { px: 1 },
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: MUTED, mt: 0.5 }}>
                          {track.icao24} · {sv?.origin_country || ''}
                        </Typography>
                      }
                    />
                    <Box sx={{ pr: 2 }}>
                      <FavoriteButton icao24={track.icao24} callsign={track.callsign || ''} />
                    </Box>
                  </ListItem>
                )
              })}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default RecentlyViewedView
