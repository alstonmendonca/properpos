/** @type {import('tailwindcss').Config} */
const { fontFamily } = require('tailwindcss/defaultTheme');

module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Brand Colors
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },

        // Semantic Colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // POS Specific Colors
        pos: {
          success: {
            DEFAULT: '#10b981',
            light: '#d1fae5',
            dark: '#065f46',
          },
          warning: {
            DEFAULT: '#f59e0b',
            light: '#fef3c7',
            dark: '#92400e',
          },
          error: {
            DEFAULT: '#ef4444',
            light: '#fee2e2',
            dark: '#991b1b',
          },
          info: {
            DEFAULT: '#3b82f6',
            light: '#dbeafe',
            dark: '#1e3a8a',
          },
          cash: '#10b981',
          card: '#3b82f6',
          online: '#8b5cf6',
          food: '#f59e0b',
          retail: '#06b6d4',
        },

        // Status Colors
        status: {
          pending: '#f59e0b',
          confirmed: '#3b82f6',
          preparing: '#f97316',
          ready: '#10b981',
          served: '#6b7280',
          completed: '#10b981',
          cancelled: '#ef4444',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans],
        mono: ['var(--font-mono)', ...fontFamily.mono],
      },
      fontSize: {
        'display-1': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-2': ['3rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'display-3': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'title-1': ['1.875rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'title-2': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'title-3': ['1.25rem', { lineHeight: '1.4' }],
        'body-1': ['1rem', { lineHeight: '1.5' }],
        'body-2': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.4' }],
        'overline': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.1em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      minWidth: {
        '0': '0',
        '1/4': '25%',
        '1/2': '50%',
        '3/4': '75%',
        'full': '100%',
      },
      minHeight: {
        '0': '0',
        '1/4': '25vh',
        '1/2': '50vh',
        '3/4': '75vh',
        'full': '100vh',
        'screen': '100vh',
      },
      maxHeight: {
        'screen-1/2': '50vh',
        'screen-3/4': '75vh',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-out': 'fade-out 0.5s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'slide-in-up': 'slide-in-up 0.3s ease-out',
        'slide-in-down': 'slide-in-down 0.3s ease-out',
        'bounce-subtle': 'bounce-subtle 2s infinite',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake': 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'bounce-subtle': {
          '0%, 100%': {
            transform: 'translateY(-5%)',
            'animation-timing-function': 'cubic-bezier(0.8,0,1,1)',
          },
          '50%': {
            transform: 'none',
            'animation-timing-function': 'cubic-bezier(0,0,0.2,1)',
          },
        },
        'pulse-subtle': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '.8',
          },
        },
        'shake': {
          '10%, 90%': {
            transform: 'translate3d(-1px, 0, 0)',
          },
          '20%, 80%': {
            transform: 'translate3d(2px, 0, 0)',
          },
          '30%, 50%, 70%': {
            transform: 'translate3d(-4px, 0, 0)',
          },
          '40%, 60%': {
            transform: 'translate3d(4px, 0, 0)',
          },
        },
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 25px 50px -12px rgba(0, 0, 0, 0.1)',
        'hard': '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 20px rgba(59, 130, 246, 0.15)',
        'glow-brand': '0 0 20px rgba(14, 165, 233, 0.15)',
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        'xs': '475px',
        '3xl': '1600px',
        'tall': { 'raw': '(min-height: 800px)' },
        'short': { 'raw': '(max-height: 700px)' },
      },
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
        '14': 'repeat(14, minmax(0, 1fr))',
        '15': 'repeat(15, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))',
        'sidebar': '250px 1fr',
        'pos-layout': '300px 1fr 350px',
        'analytics': 'repeat(auto-fit, minmax(300px, 1fr))',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'),

    // Custom plugin for POS specific utilities
    function({ addUtilities, addComponents, theme }) {
      addComponents({
        '.pos-card': {
          '@apply bg-card rounded-lg border shadow-soft p-6': {},
        },
        '.pos-button-primary': {
          '@apply bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-10 px-4 py-2': {},
        },
        '.pos-button-secondary': {
          '@apply bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-10 px-4 py-2': {},
        },
        '.pos-input': {
          '@apply flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50': {},
        },
        '.pos-badge': {
          '@apply inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2': {},
        },
        '.pos-badge-success': {
          '@apply bg-pos-success-light text-pos-success-dark border-pos-success': {},
        },
        '.pos-badge-warning': {
          '@apply bg-pos-warning-light text-pos-warning-dark border-pos-warning': {},
        },
        '.pos-badge-error': {
          '@apply bg-pos-error-light text-pos-error-dark border-pos-error': {},
        },
        '.pos-scrollbar': {
          'scrollbar-width': 'thin',
          'scrollbar-color': `${theme('colors.border')} transparent`,
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: theme('colors.border'),
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: theme('colors.muted.foreground'),
            },
          },
        },
      });

      addUtilities({
        '.text-balance': {
          'text-wrap': 'balance',
        },
        '.glass': {
          'backdrop-filter': 'blur(12px) saturate(180%)',
          'background-color': 'rgba(255, 255, 255, 0.05)',
          'border': '1px solid rgba(255, 255, 255, 0.1)',
        },
        '.glass-dark': {
          'backdrop-filter': 'blur(12px) saturate(180%)',
          'background-color': 'rgba(0, 0, 0, 0.05)',
          'border': '1px solid rgba(0, 0, 0, 0.1)',
        },
      });
    },
  ],
};