/** Sticker-style pad icons: white shapes with an ink outline, drawn on a 48-unit grid. */
const INK = "#1c2547";
const svg = (body, extra = "") => `<svg class="ico" viewBox="0 0 48 48" aria-hidden="true"${extra}><g fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

/** One flipper of the clapping pair, root low left, tip at the top centre. */
const CLAP_WING = "M10 44c-5-12-1-27 10-34 3-2 6 0 5 4-1 10-5 21-11 30-1 2-3 2-4 0z";

const FOOT = `<path d="M24 44c-6 0-8-5-8-9L6 17c-2-4 2-8 6-5 3 3 6 4 8 1l1-6c1-5 5-5 6 0l1 6c2 3 5 2 8-1 4-3 8 1 6 5L32 35c0 4-2 9-8 9z"/><path d="M24 37V15M21 35l-8-16M27 35l8-16" fill="none" stroke-width="2.2"/>`;

export const ICONS = {
  left: svg(FOOT, ` style="transform: rotate(-10deg)"`),
  right: svg(FOOT, ` style="transform: scaleX(-1) rotate(-10deg)"`),
  flap: svg(`<path d="M13 42c-4-13 2-30 15-36 6-3 11 2 8 8-4 10-10 20-18 28-2 2-4 2-5 0z"/><path d="M19 30c4-7 8-14 12-19" fill="none" stroke-width="2.2"/><path d="M38 25c3 3 3 8 0 11M42.5 20c5 5 5 14 0 19" fill="none" stroke-width="2.6"/>`),
  clap: svg(`<g transform="translate(24 27) scale(0.86) translate(-24 -27)"><path d="${CLAP_WING}"/><path d="${CLAP_WING}" transform="translate(48 0) scale(-1 1)"/></g><path d="M5.5 22c-3 4-3 10 0 14M42.5 22c3 4 3 10 0 14M24 2.5v5M16 5l2.5 4M32 5l-2.5 4" fill="none" stroke-width="2.6"/>`),
};

/** A snowflake for frozen pads, as a CSS background. */
export const SNOWFLAKE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke="${INK}" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 3 3-3M9 20l3-3 3 3"/></g></svg>`)}")`;
