/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2454B7',   // Primary CTA / links on light
          hover:   '#2B64D1',
          active:  '#1D4698',
          cyan:    '#4CCCE8',   // Signal Cyan — accent only (chart highlights, status)
          blue:    '#2E9FE0',   // Interface Blue — secondary accent
        },
        // Semantic surface tokens — adapt to theme. Current values = LIGHT theme.
        surface: {
          DEFAULT:  '#F4F7FB',  // App background (tint of Soft White)
          raised:   '#FFFFFF',  // Cards / panels
          elevated: '#F1F5F9',  // Subtle differentiation — table headers, chips, pills
          dark:     '#07133A',  // Dark chrome: header bars in an otherwise light app
        },
        divider: {
          DEFAULT: '#E2E8F0',   // Soft gray borders
          bright:  '#CBD5E1',   // Slightly stronger for emphasis
        },
        ink: {
          DEFAULT:  '#07133A',  // Midnight Navy — primary text on light
          inverse:  '#EEF2F7',  // Soft White — text on brand-colored / dark surfaces
          muted:    '#64748B',  // Secondary text
          disabled: '#94A3B8',
          data:     '#475569',  // Data viz / subdued numbers
        },
        success: '#0EA5A0',     // Slightly deeper teal for light-bg contrast
        warning: '#D97706',     // Amber that reads on white
        danger:  '#DC2626',     // Red that reads on white
      },
      borderColor: {
        // Bare `border` = soft divider.
        DEFAULT: '#E2E8F0',
      },
      ringOffsetColor: {
        surface: '#F4F7FB',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2454B7 0%, #4CCCE8 100%)',
      },
      boxShadow: {
        // Very soft elevations, tuned for light UI.
        'card':    '0 1px 2px 0 rgb(15 23 42 / 0.03), 0 0 0 1px rgb(15 23 42 / 0.03)',
        'raised':  '0 8px 24px -4px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)',
      },
    },
  },
  plugins: [],
}
