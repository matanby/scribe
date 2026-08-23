/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        apple: {
          bg: '#F5F5F7',
          card: '#FFFFFF',
          sidebar: 'rgba(246, 246, 246, 0.85)',
          sidebarDark: 'rgba(30, 30, 30, 0.85)',
          accent: '#E5A00D',
          accentHover: '#CC8E0A',
          border: 'rgba(0, 0, 0, 0.08)',
          borderDark: 'rgba(255, 255, 255, 0.08)',
          text: '#1D1D1F',
          secondary: '#86868B',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Arial Hebrew"',
          'Heebo',
          'Rubik',
          'system-ui',
          'sans-serif'
        ],
        hebrew: [
          '"Arial Hebrew"',
          'Heebo',
          'Rubik',
          '"Noto Sans Hebrew"',
          'sans-serif'
        ]
      }
    },
  },
  plugins: [],
};
