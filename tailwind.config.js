const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    bg: v('bg'), panel: v('panel'), panel2: v('panel2'), line: v('line'),
    accent: v('accent'), accent2: v('info'), warn: v('warn'), bad: v('bad'), mid: v('mid') } } },
  plugins: [],
};
