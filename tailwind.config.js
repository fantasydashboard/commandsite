/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2454B7',   // Primary CTA
          hover:   '#2B64D1',
          active:  '#1D4698',
          cyan:    '#4CCCE8',   // Signal Cyan — secondary accent
          blue:    '#2E9FE0',   // Interface Blue — links/highlights
        },
        surface: {
          DEFAULT:  '#07133A',  // App background (Midnight Navy)
          raised:   '#0B1A4D',  // Cards / panels
          elevated: '#10245F',  // Elevated surfaces
        },
        divider: {
          DEFAULT: '#16305F',   // Border Dark
          bright:  '#365FAD',   // Border Light
        },
        ink: {
          DEFAULT:  '#EEF2F7',  // Soft White — main text on dark
          muted:    '#93A4C1',
          disabled: '#6F819F',
          data:     '#C9D5E4',  // Data Gray — data viz / subdued numbers
        },
        success: '#2ED3B7',
        warning: '#F2B544',
        danger:  '#E85D75',
      },
      borderColor: {
        // Make bare `border` produce the primary divider color.
        DEFAULT: '#16305F',
      },
      ringOffsetColor: {
        surface: '#07133A',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2454B7 0%, #4CCCE8 100%)',
      },
    },
  },
  plugins: [],
}
