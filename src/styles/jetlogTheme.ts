import { createTheme, responsiveFontSizes } from '@mui/material/styles';

const rawJetLogTheme = createTheme({
  map: {
    style: 'https://tiles.openfreemap.org/styles/positron'
  },
  typography: {
    htmlFontSize: 12,
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    h2: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    h3: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    h4: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    h5: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    h6: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    subtitle1: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontSize: '0.9rem' },
    subtitle2: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontSize: '0.85rem' },
    body1: { fontSize: '1.05rem' },
    body2: { fontSize: '0.95rem' },
    caption: { fontFamily: '"Space Mono", "Courier New", monospace', fontSize: '0.85rem', letterSpacing: '0.04em' },
    button: { fontFamily: '"Space Mono", "Courier New", monospace', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#111827',
      light: '#4b5563',
      dark: '#030712',
    },
    secondary: {
      main: '#d4a017',
      light: '#f5c842',
      dark: '#a67c00',
    },
    background: {
      default: '#f5f0e8',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#6b6b6b',
    },
    divider: '#d6d0c4',
    action: {
      hover: '#f0ebe0',
      selected: '#fdf6e3',
      disabled: '#d6d0c4',
    },
    success: { main: '#16a34a' },
    warning: { main: '#d4a017' },
    error: { main: '#dc2626' },
    info: { main: '#d4a017' },
    command: {
      main: '#d4a017',
      light: '#f5c842',
      dark: '#a67c00',
    },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'uppercase' as const,
          fontWeight: 600,
          letterSpacing: '0.05em',
        },
        containedPrimary: {
          backgroundColor: '#d4a017',
          color: '#1a1a1a',
          '&:hover': { backgroundColor: '#a67c00' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontFamily: '"Space Mono", "Courier New", monospace',
          fontSize: '0.8rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          fontWeight: 600,
          height: 24,
        },
        outlined: {
          borderColor: '#d6d0c4',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            backgroundColor: '#ffffff',
            fontFamily: '"Space Mono", "Courier New", monospace',
            fontSize: '0.95rem',
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#d6d0c4',
        },
      },
    },
  },
});

export const JetLogTheme = responsiveFontSizes(rawJetLogTheme);
