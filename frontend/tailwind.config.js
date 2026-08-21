/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#e8622c', light: '#fdeadd' },
        teal:    { DEFAULT: '#178f8f', light: '#dff0f0' },
        success: { DEFAULT: '#2a7d5f', light: '#e7f2ec' },
        warning: { DEFAULT: '#d99a10', light: '#fdf1d6' },
        danger:  { DEFAULT: '#E53935', light: '#FDECEA' },
        gold:    '#d99a10',
        surface: '#ffffff',
        bg:      '#fff9f0',
        border:  '#f0e5d4',
        muted:   '#8a8072',
      },
      fontFamily: {
        sans:    ['"Nunito Sans"', 'system-ui', 'sans-serif'],
        display: ['Fredoka', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
