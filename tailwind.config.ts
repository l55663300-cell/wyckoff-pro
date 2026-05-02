import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00D4AA',
          dark: '#00B896',
          deeper: '#26A17B',
        },
        bg: {
          deepest: '#0B0E1A',
          deep: '#131722',
          card: '#1E2130',
          elevated: '#252B3B',
        },
        text: {
          primary: '#D1D4DC',
          muted: '#787B86',
          white: '#FFFFFF',
        },
        bull: '#26A69A',
        bear: '#EF5350',
        warn: '#F59E0B',
        info: '#3B82F6',
      },
      fontFamily: {
        mono: ['Roboto Mono', 'monospace'],
        sans: ['Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [animate],
} satisfies Config
