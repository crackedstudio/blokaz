/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        'paper-2': 'rgb(var(--paper-2-rgb) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'paper-lime': '#D8FF57',
        'paper-pink': '#FFB8D6',
        'paper-cyan': '#8CEEF0',
        'paper-purple': '#C8B5FF',
        'piece-red': '#FF3D3D',
        'piece-orange': '#FF7A1A',
        'piece-yellow': '#FFD51F',
        'piece-lime': '#B7FF3B',
        'piece-green': '#2CE66A',
        'piece-cyan': '#29E6E6',
        'piece-blue': '#2F6BFF',
        'piece-purple': '#8A3DFF',
        'piece-pink': '#FF3BBD',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'sans-serif'],
        body: ['"Space Grotesk"', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
      },
      letterSpacing: {
        brutal: '0.14em',
        tightest: '-0.04em',
      },
      boxShadow: {
        brutal: '6px 6px 0 var(--ink)',
        'brutal-sm': '3px 3px 0 var(--ink)',
        'brutal-lg': '8px 8px 0 var(--ink)',
        'brutal-xl': '10px 10px 0 var(--ink)',
        'brutal-press': '0px 0px 0 var(--ink)',
        'brutal-yellow': '6px 6px 0 #FFD51F',
        'brutal-pink': '8px 8px 0 #FFB8D6',
        'brutal-blue': '6px 6px 0 #2F6BFF',
      },
      keyframes: {
        scoreFlash: {
          '0%, 100%': { backgroundColor: 'transparent' },
          '30%': { backgroundColor: '#FFD51F' },
        },
        comboSunburst: {
          '0%': { opacity: '0', transform: 'scale(0.8) rotate(0deg)' },
          '15%': { opacity: '0.9' },
          '80%': { opacity: '0.85' },
          '100%': { opacity: '0', transform: 'scale(1.15) rotate(12deg)' },
        },
        comboText: {
          '0%': { transform: 'scale(0.3) rotate(-12deg)', opacity: '0' },
          '40%': { transform: 'scale(1.12) rotate(2deg)', opacity: '1' },
          '70%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'scale(0.9) rotate(-2deg)', opacity: '0' },
        },
        comboStreak: {
          '0%': { transform: 'rotate(-8deg) scale(0)', opacity: '0' },
          '50%': { transform: 'rotate(3deg) scale(1.1)', opacity: '1' },
          '80%': { transform: 'rotate(-2deg) scale(1)', opacity: '1' },
          '100%': { transform: 'rotate(4deg) scale(0.8)', opacity: '0' },
        },
        tensionStrobe: {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '32px 0' },
        },
        floatUp: {
          '0%': { transform: 'translateY(0) rotate(var(--rot))', opacity: '1' },
          '100%': {
            transform: 'translateY(-60px) rotate(calc(var(--rot) + 20deg))',
            opacity: '0',
          },
        },
      },
      animation: {
        'score-flash': 'scoreFlash 120ms ease-out',
        'combo-sunburst': 'comboSunburst 1.2s ease-out forwards',
        'combo-text':
          'comboText 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'combo-streak':
          'comboStreak 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s forwards',
        'tension-strobe': 'tensionStrobe 400ms linear infinite',
        'float-up': 'floatUp 1s ease-out forwards',
      },
    },
  },
  plugins: [],
}
