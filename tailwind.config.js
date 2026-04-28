/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1a1a1a',
        panel: '#222',
        border: '#333',
        accent: '#4ea1ff',
        text: '#ddd',
        muted: '#888'
      }
    }
  },
  plugins: []
};
