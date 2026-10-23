/* Draws an icon kept as an SVG string (core/constants.js ICON, CLOSE, LOGOUT…) as a real <svg>,
   so CSS like ".nav svg" works the same as before. The strings are fixed text in our own code. */
const cache = new Map();
const camel = k => (k === "class" ? "className" : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
function parse(str) {
  if (cache.has(str)) return cache.get(str);
  const m = String(str).match(/^\s*<svg([^>]*)>([\s\S]*)<\/svg>\s*$/);
  const attrs = {};
  if (m) for (const [, k, v] of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[camel(k)] = v;
  const out = { attrs, inner: m ? m[2] : "" };
  cache.set(str, out);
  return out;
}
export function Svg({ svg, ...rest }) {
  const { attrs, inner } = parse(svg);
  return <svg {...attrs} {...rest} dangerouslySetInnerHTML={{ __html: inner }} />;
}
