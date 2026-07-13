import React from 'react'
import { useTheme } from '@mui/material/styles'
import { Box, Typography, List, ListItem, ListItemText, IconButton, Chip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useAppStore } from '../store/useStore.js'

const FavoritesView: React.FC = () => {
  const theme = useTheme()
  const MONO = '"Space Mono", "Courier New", monospace'
  const BG = theme.palette.background.default
  const CARD_BG = theme.palette.background.paper
  const BORDER = theme.palette.divider
  const MUTED = theme.palette.text.secondary
  const DARK = theme.palette.text.primary

  const { favorites, removeFavorite } = useAppStore()

  const sortedFavorites = React.useMemo(() => {
    return [...favorites].sort((a, b) => b.addedAt - a.addedAt)
  }, [favorites])

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
          Favorite Flights
        </Typography>

        {sortedFavorites.length === 0 ? (
          <Box sx={{
            p: 6,
            textAlign: 'center',
            border: `1px solid ${BORDER}`,
            borderRadius: 0,
            backgroundColor: CARD_BG,
          }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '1.0rem', color: MUTED, mb: 1 }}>
              No favorite flights yet
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: MUTED }}>
              Click the heart icon on any flight to add it to your favorites
            </Typography>
          </Box>
        ) : (
          <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: 0, backgroundColor: CARD_BG }}>
            <List disablePadding>
              {sortedFavorites.map((fav, index) => (
                <ListItem
                  key={fav.icao24}
                  disablePadding
                  secondaryAction={
                    <IconButton edge="end" onClick={() => removeFavorite(fav.icao24)} size="small" sx={{ mr: 1 }}>
                      <DeleteIcon sx={{ fontSize: 18, color: MUTED }} />
                    </IconButton>
                  }
                  sx={{ borderBottom: index < sortedFavorites.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                >
                  <ListItemText
                    sx={{ px: 2.5, py: 2 }}
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '1.05rem', color: DARK }}>
                          {fav.callsign || fav.icao24}
                        </Typography>
                        <Chip
                          label={fav.icao24}
                          size="small"
                          sx={{ height: 20, fontSize: '0.9rem', fontFamily: MONO, backgroundColor: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 0 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: MUTED, mt: 0.5 }}>
                        Added {new Date(fav.addedAt).toLocaleDateString()}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default FavoritesView
