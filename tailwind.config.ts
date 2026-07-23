import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      // Color de marca del panel — antes se escribía "violet-600" a mano en
      // 25 archivos distintos (botones, focus rings, links, etc.), así que
      // cambiar el color de marca implicaba encontrar cada uso a mano. Ahora
      // hay un solo lugar: acá. Los tonos 50-500 quedan iguales a la escala
      // zinc que ya usa el resto del panel (para que conviva bien con el
      // resto de la UI); 600/700 son los que definen el color de marca
      // (base/hover) para botones y estados activos.
      colors: {
        primary: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#A4A49C',
          700: '#8B8B83',
        },
      },
    },
  },
  plugins: [],
}

export default config
