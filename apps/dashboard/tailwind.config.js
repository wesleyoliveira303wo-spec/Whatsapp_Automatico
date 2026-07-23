/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,tsx}",
    "./components/**/*.{js,ts,tsx}"
  ],
  theme: {
    extend: {
      // Milestone 3, Bloco 6 (D30): primeiro token real do design system —
      // cor primaria formalizada em CLAUDE.md par.9 desde a Milestone 0, nunca
      // implementada ate aqui. Aplicada SOMENTE aos componentes novos do
      // Bloco 6 (decisao aprovada: sem migracao retroativa dos componentes
      // da Milestone 2 neste bloco).
      colors: {
        primary: '#0A74DA',
      },
    },
  },
  plugins: [],
};
