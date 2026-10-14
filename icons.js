/* 内联 SVG 图标（方形线条风，与零圆角统一）。全项目禁 emoji，图标只用这里的 SVG。 */
'use strict';

const ICONS = {
  play: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 2 L13 8 L4 14 Z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M4 2 H6.5 V14 H4 Z M9.5 2 H12 V14 H9.5 Z" fill="currentColor" stroke="none"/></svg>',
  clock: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><circle cx="8" cy="9" r="5.2"/><path d="M8 5.8 V9 L10.5 10.2 M5.5 1 H10.5"/></svg>',
  map: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M1.5 4 L6 2 L10 4 L14.5 2 V12 L10 14 L6 12 L1.5 14 Z M6 2 V12 M10 4 V14"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7"/><path d="M5.5 7 V5 A2.5 2.5 0 0 1 10.5 5 V7"/></svg>',
  unlock: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7"/><path d="M5.5 7 V5 A2.5 2.5 0 0 1 10.4 5.4 M10.4 5.4 V6.6"/></svg>',
  chart: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><path d="M2 2 V14 H14"/><path d="M4.5 11 H7 V6.5 H9.5 V9.5 H12"/></svg>',
  book: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true"><rect x="4" y="1.5" width="8" height="13"/><path d="M7 1.5 V14.5"/></svg>',
  bulb: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true"><circle cx="8" cy="6.5" r="3.6"/><path d="M8 1.2 V2.6 M3.4 3 L4.4 4 M12.6 3 L11.6 4 M6.4 10.2 H9.6 L9.1 12.4 H6.9 Z M7.2 14 H8.8"/></svg>',
  warn: '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M8 1.5 L14.8 13.5 H1.2 Z M8 6 V9.8 M8 12 V12.2"/></svg>',
};
