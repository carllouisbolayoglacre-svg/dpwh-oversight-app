// theme.js
// Utilitarian, rugged design tokens optimized for outdoor bright sunlight use

export const THEME = {
  colors: {
    // Primary DPWH Deep Navy - High contrast, authoritative, professional
    primary: '#003366',
    primaryDark: '#002244',
    primaryLight: '#0A4A8F',
    primaryPressed: '#001A33',
    primarySurface: '#E6EFF8',

    // Outdoor Sunlight Readability - Deepest blacks and crisp slates
    textPrimary: '#0F172A',     // Near-black slate for maximum contrast under sun
    textSecondary: '#334155',   // High-contrast secondary text
    textMuted: '#475569',       // Legible muted labels
    textInverse: '#FFFFFF',     // Crisp white text on dark buttons/badges

    // Canvas & Surfaces
    background: '#EEF2F6',      // Glare-reducing neutral field gray
    card: '#FFFFFF',            // Crisp solid white card surface
    surfaceAlt: '#F8FAFC',

    // Rugged Industrial Borders (Thick, visible in harsh glare)
    border: '#94A3B8',          // Strong slate border
    borderStrong: '#475569',    // High-contrast emphasis border
    borderLight: '#CBD5E1',     // Standard divider
    borderFocus: '#003366',     // Deep blue focused state

    // Tactical & Status Signals (High-visibility safety colors)
    success: '#047857',         // Vivid field green (Inside boundary)
    successBg: '#D1FAE5',
    successBorder: '#059669',
    successText: '#064E3B',

    warning: '#B45309',         // High-vis construction amber
    warningBg: '#FEF3C7',
    warningBorder: '#D97706',
    warningText: '#78350F',

    danger: '#B91C1C',          // Safety Red (Outside boundary / GPS weak)
    dangerBg: '#FEE2E2',
    dangerBorder: '#DC2626',
    dangerText: '#7F1D1D',

    // Tactical Camera HUD
    reticle: '#00E5FF',         // High-vis cyan reticle (stands out on concrete, mud, asphalt)
    hudOverlay: 'rgba(15, 23, 42, 0.82)',
    hudBorder: 'rgba(255, 255, 255, 0.3)',
    hudText: '#FFFFFF',
    hudAccent: '#FACC15',       // High-vis safety yellow
  },

  metrics: {
    touchTargetMin: 48,
    buttonHeight: 56,
    buttonHeightSm: 46,
    inputHeight: 54,
    borderRadiusSm: 6,
    borderRadiusMd: 10,
    borderRadiusLg: 14,
    borderWidthRugged: 2,
    borderWidthStandard: 1.5,
  },

  typography: {
    hero: { fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
    title: { fontSize: 20, fontWeight: '700', letterSpacing: 0.3 },
    subtitle: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 15, fontWeight: '500' },
    bodyBold: { fontSize: 15, fontWeight: '700' },
    caption: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
    metric: { fontSize: 32, fontWeight: '800' },
    button: { fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
  },
};
