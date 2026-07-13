import React from 'react'
import { IconButton, Tooltip } from '@mui/material'
import FavoriteIcon from '@mui/icons-material/Favorite'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import { useAppStore } from '../store/useStore.js'

interface FavoriteButtonProps {
  icao24: string
  callsign: string
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({ icao24, callsign }) => {
  const addFavorite = useAppStore(s => s.addFavorite)
  const removeFavorite = useAppStore(s => s.removeFavorite)
  const favorited = useAppStore(s => s.favorites.some(f => f.icao24 === icao24))

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (favorited) {
      removeFavorite(icao24)
    } else {
      addFavorite(icao24, callsign)
    }
  }

  return (
    <Tooltip title={favorited ? 'Remove from favorites' : 'Add to favorites'}>
      <IconButton onClick={handleClick} size="small">
        {favorited ? (
          <FavoriteIcon color="error" fontSize="small" />
        ) : (
          <FavoriteBorderIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  )
}

export default FavoriteButton
