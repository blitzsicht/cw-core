// Winziger Hyperscript-Helper. Satori akzeptiert React-Element-artige Objekte
// ({ type, props: { children, style } }) direkt — so bauen wir Templates ohne
// JSX/React-Toolchain (cw-core ist eine Astro-Source-Lib ohne React).
//
//   h('div', { style: { display: 'flex' } }, 'Text', h('span', {}, '→'))
//
// null/undefined/false-Kinder werden verworfen (bequeme Conditionals im Markup).
export function h(type, props = {}, ...children) {
  const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: {
      ...props,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}
