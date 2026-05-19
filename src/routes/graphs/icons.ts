// SVG icon content strings for use as GraphNode `svg_content`.
// All icons are designed on a 40×40 grid.
// Use `svg_viewbox: '0 0 40 40'` on the node to scale correctly.
const STYLE = 'stroke-width="1"; stroke="STROKE_HEX"; fill="none"; stroke-linecap:round; stroke-linejoin:round; ';

export const ICONS = {
  person:
    `<circle cx="20" cy="9.8" r="7.9" ${STYLE} /> ` +
    `<path d="M7.8 38h24.4c4.5 0 7-3.6 4.4-7.2A20 20 0 0 0 20 21.6a20 20 0 0 0-16.6 9.2C.8 34.5 3.4 38 7.8 38" ${STYLE}/> `,

  robot_arm:
    `  <path d="M31 3a7 7 0 0 0-5.5 3 7 7 0 0 0-1 2.4L7.7 12l-1.6-.3a3.6 3.6 0 0 0-3.6 3.6A3.6 3.6 0 0 0 6 19l10.6 10.6h-6v7.9h20v-8h-7L10.5 16.4 25.3 13a7 7 0 0 0 2 2 7 7 0 0 0 7.9-.4l-3.3-2.1a3 3 0 0 1-2.7-.4 3 3 0 0 1-.8-4.1 3 3 0 0 1 4.2-.8A3 3 0 0 1 34 9.5l3.3 2.2a7 7 0 0 0-2.6-7.5 7 7 0 0 0-3.5-1.1" ${STYLE}/>`,

  data:
    `<path d="M6.5 5.5v29m5.5-21v21m5.3-27.6v27.6m5.4-20.9v20.9m5.3-7.3v7.3m5.5 0V18" ${STYLE}/>`,

    hdd:
        `<path d="M21.2 10.6h12.9M4.8 6.8a2.6 2.6 0 0 0-2.6 2.6V11c0 1.4 1.2 2.6 2.6 2.6h30.4c1.4 0 2.6-1.2 2.6-2.6V9.4c0-1.4-1.2-2.6-2.6-2.6zm1.6 2.3a1 1 0 0 1 1 1 1 1 0 0 1-1 1.1 1 1 0 0 1-1-1 1 1 0 0 1 1-1.1m14.8 11.3h12.9M4.8 16.7a2.6 2.6 0 0 0-2.6 2.6v1.4c0 1.5 1.2 2.6 2.6 2.6h30.4c1.4 0 2.6-1.1 2.6-2.6v-1.4c0-1.5-1.2-2.6-2.6-2.6zm1.6 2.2a1 1 0 0 1 1 1.1 1 1 0 0 1-1 1 1 1 0 0 1-1-1 1 1 0 0 1 1-1m14.8 11.3h12.9M4.8 26.5a2.6 2.6 0 0 0-2.6 2.6v1.5c0 1.4 1.2 2.6 2.6 2.6h30.4c1.4 0 2.6-1.2 2.6-2.6V29c0-1.4-1.2-2.6-2.6-2.6zm1.6 2.3a1 1 0 0 1 1 1 1 1 0 0 1-1 1.1 1 1 0 0 1-1-1 1 1 0 0 1 1-1.1" ${STYLE}/>`,

  search:
    `<path d="m18 19.4 14.7 15M20 13.9a7.9 7.9 0 1 1-15.7 0A7.9 7.9 0 0 1 20 14" ${STYLE}/>`,

  beaker:
    `<path d="m23.8 26.2-.6.6-.6-.6.6-.6zM18 28.9a1.6 1.6 0 0 1-1.7 1.7 1.6 1.6 0 0 1-1.6-1.7 1.6 1.6 0 0 1 1.6-1.6 1.6 1.6 0 0 1 1.7 1.6m-4.8-6c5.4 2.1 8.4-3.2 12.8-1M20 36h-8.2a3.2 3.2 0 0 1-2.9-4.6l7.6-14.9V8.6h-1.2q-1.1-.1-1.2-1.1V5q0-1 1.2-1.1H20m0 32h8.2c2.4 0 4-2.5 2.9-4.6l-7.6-14.9V8.6h1.2q1.1-.1 1.2-1.1V5q0-1-1.2-1.1H20" ${STYLE}/> `,

  list:
        `<path d="M11.2 29.8H37M2.8 27.7h4.1v4.1H2.8Zm8.4-7.7H37M2.8 18h4.1v4H2.8Zm8.4-7.8H37m-34.2-2h4.1v4.1H2.8Z" ${STYLE}/>`,

  molecule:
    `<circle cx="20" cy="20" r="4" ${STYLE}/>` +
    `<circle cx="7" cy="11" r="3" ${STYLE}/>` +
    `<circle cx="33" cy="11" r="3" ${STYLE}/>` +
    `<circle cx="7" cy="29" r="3" ${STYLE}/>` +
    `<circle cx="33" cy="29" r="3" ${STYLE}/>` +
    `<path d="M10 12.8L16 17M24 17L30 12.8M10 27.2L16 23M24 23L30 27.2M7 14V26M33 14V26" ${STYLE}/>`,

  gear:
    `<circle cx="20" cy="20" r="6" ${STYLE}/>` +
    `<path d="M20 4v5m0 22v5M4 20h5m22 0h5M7.5 7.5l3.5 3.5m18 18 3.5 3.5M32.5 7.5l-3.5 3.5m-18 18-3.5 3.5" ${STYLE}/>`,

  funnel:
    `<path d="M4 7h32L24 20v13l-8-4V20Z" ${STYLE}/>`,

  brain:
    `<circle cx="20" cy="7" r="3" ${STYLE}/>` +
    `<circle cx="8" cy="19" r="3" ${STYLE}/>` +
    `<circle cx="32" cy="19" r="3" ${STYLE}/>` +
    `<circle cx="13" cy="33" r="3" ${STYLE}/>` +
    `<circle cx="27" cy="33" r="3" ${STYLE}/>` +
    `<circle cx="20" cy="23" r="3" ${STYLE}/>` +
    `<path d="M20 10L20 20M20 10L11 17M20 10L29 17M11 19L17 22M29 19L23 22M8 22L13 30M32 22L27 30M17 25L13 30M23 25L27 30" ${STYLE}/>`,

  transform:
    `<path d="M6 13h26m0 0-5-5m5 5-5 5M34 27H8m0 0 5-5m-5 5 5 5" ${STYLE}/>`,

} as const;

export type IconName = keyof typeof ICONS;
