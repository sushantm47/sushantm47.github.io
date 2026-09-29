// Project tile artwork, drawn in code so there are no image files to load.
// Each drawing uses only presentation attributes (no inline styles) so it passes the CSP.

const INK = "#0B1120";
const S = `fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;

const ART = {
  // OpsPilot: an alert flowing through four agent steps to a verified check.
  flow: `
    <path d="M36 70 L56 36 L76 70 Z" ${S}/><path d="M56 49 L56 58" ${S}/><circle cx="56" cy="64" r="1.5" fill="${INK}"/>
    <rect x="30" y="112" width="68" height="46" rx="10" ${S}/>
    <rect x="124" y="112" width="68" height="46" rx="10" ${S}/>
    <rect x="218" y="112" width="68" height="46" rx="10" ${S}/>
    <rect x="312" y="112" width="68" height="46" rx="10" ${S}/>
    <path d="M98 135 L124 135 M192 135 L218 135 M286 135 L312 135" ${S}/>
    <path d="M56 80 L64 112" ${S} stroke-dasharray="2 9"/>
    <circle cx="346" cy="66" r="22" ${S}/><path d="M335 66 L343 74 L358 58" ${S}/>
    <path d="M346 88 L346 112" ${S} stroke-dasharray="2 9"/>
    <path d="M44 186 L150 186 M44 204 L112 204" ${S} opacity="0.45"/>`,
  // DealRadar: a price line dropping below the target line, with the deal marked.
  chart: `
    <path d="M30 196 L380 196 M30 40 L30 196" ${S} opacity="0.45"/>
    <path d="M30 150 L380 150" ${S} stroke-dasharray="4 12"/>
    <path d="M40 92 L90 80 L140 104 L190 72 L240 96 L290 118 L330 168 L370 176" ${S}/>
    <circle cx="330" cy="168" r="11" ${S}/>
    <path d="M300 58 L360 58 L372 72 L360 86 L300 86 Z" ${S}/><circle cx="314" cy="72" r="3" fill="${INK}"/>`,
  // DNS simulation: a resolver asking root, TLD, and authoritative servers.
  network: `
    <circle cx="70" cy="120" r="24" ${S}/>
    <rect x="200" y="30" width="80" height="44" rx="10" ${S}/>
    <rect x="200" y="98" width="80" height="44" rx="10" ${S}/>
    <rect x="200" y="166" width="80" height="44" rx="10" ${S}/>
    <path d="M94 112 L200 58 M94 120 L200 120 M94 128 L200 184" ${S}/>
    <path d="M280 188 L330 188 L330 120 L352 120" ${S} stroke-dasharray="2 10"/>
    <circle cx="364" cy="120" r="12" ${S}/>`,
  // COVID-19 tracker: a globe beside a small bar chart.
  globe: `
    <circle cx="120" cy="120" r="72" ${S}/>
    <ellipse cx="120" cy="120" rx="30" ry="72" ${S}/>
    <path d="M48 120 L192 120 M60 84 L180 84 M60 156 L180 156" ${S}/>
    <path d="M250 196 L380 196" ${S} opacity="0.45"/>
    <path d="M268 196 L268 140 M300 196 L300 100 M332 196 L332 124 M364 196 L364 70" ${S}/>`,
};

export function artSvg(kind) {
  const body = ART[kind] || ART.flow;
  return `<svg viewBox="0 0 410 240" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ART_KINDS = Object.keys(ART);
