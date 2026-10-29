/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'Roboto', 'system-ui', 'sans-serif'],
      },
      // Material 3 / Google color roles (light scheme, Google-blue primary).
      colors: {
        brand: {
          50: '#E8F0FE',
          100: '#D3E3FD',
          200: '#A8C7FA',
          400: '#669DF6',
          500: '#4285F4',
          600: '#1A73E8',
          700: '#1967D2',
        },
        bg: '#F6F8FC', // surface-container-low
        surface: '#FFFFFF',
        ink: '#1F1F1F', // on-surface
        muted: '#5F6368', // on-surface-variant (Google grey)
        outline: '#DADCE0',
        tonal: '#D3E3FD', // secondary/primary container (nav indicator, tonal btn)
        ontonal: '#062E6F',
        success: '#1E8E3E',
        danger: '#D93025',
      },
      boxShadow: {
        // Material elevation levels 1–2.
        e1: '0 1px 2px rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
        e2: '0 1px 2px rgba(60,64,67,0.3), 0 2px 6px 2px rgba(60,64,67,0.15)',
      },
    },
  },
  plugins: [],
};
