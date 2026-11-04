import { createTheme, type Shadows } from '@mui/material/styles';

const primary = '#12293B';
const secondary = '#2F6B98';
const border = '#DDE3E8';
// Same identity as the client portal (portal/src/index.css): white background, 12px cards, 10px controls.
const background = '#FFFFFF';
const radiusCard = 12;
const radiusControl = 10;

export const ledurTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: primary,
      dark: '#0D1D2A',
      light: '#1E405B',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: secondary,
      dark: '#285B82',
      light: '#4E83AA',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#2E9D6F',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#E79A25',
      contrastText: '#000000',
    },
    error: {
      main: '#C13B3B',
      contrastText: '#FFFFFF',
    },
    background: {
      default: background,
      paper: '#FFFFFF',
    },
    text: {
      primary: '#000000',
      secondary: '#5B5D5B',
    },
    divider: border,
  },
  typography: {
    fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h1: { fontWeight: 800, letterSpacing: 0 },
    h2: { fontWeight: 800, letterSpacing: 0 },
    h3: { fontWeight: 800, letterSpacing: 0 },
    h4: { fontWeight: 800, letterSpacing: 0 },
    h5: { fontWeight: 800, letterSpacing: 0 },
    h6: { fontWeight: 800, letterSpacing: 0 },
    button: { fontWeight: 700, letterSpacing: 0, textTransform: 'none' },
  },
  shape: {
    borderRadius: radiusCard,
  },
  shadows: [
    'none',
    '0 1px 3px 0 rgb(0 0 0 / 0.05)',
    '0 4px 12px -2px rgb(0 0 0 / 0.08)',
    '0 8px 24px -4px rgb(0 0 0 / 0.1)',
    '0 10px 28px -6px rgb(0 0 0 / 0.12)',
    ...Array(20).fill('0 12px 32px -10px rgb(0 0 0 / 0.14)'),
  ] as Shadows,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: background,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: radiusControl,
          fontWeight: 700,
          minHeight: 40,
          textTransform: 'none',
        },
        containedPrimary: {
          backgroundColor: primary,
          '&:hover': {
            backgroundColor: '#193750',
          },
        },
        outlinedPrimary: {
          borderColor: secondary,
          color: primary,
          '&:hover': {
            backgroundColor: 'rgb(47 107 152 / 0.07)',
            borderColor: primary,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${border}`,
          borderRadius: radiusCard,
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
          color: primary,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: radiusCard,
        },
        elevation1: {
          border: `1px solid ${border}`,
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
        },
        elevation2: {
          border: `1px solid ${border}`,
          boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
        },
        elevation3: {
          border: `1px solid ${border}`,
          boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.1)',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radiusControl,
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: secondary,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: secondary,
          },
        },
        notchedOutline: {
          borderColor: '#D9E1E8',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: secondary,
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: radiusControl,
          fontWeight: 600,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radiusCard,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: secondary,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          textTransform: 'none',
        },
      },
    },
  },
});
