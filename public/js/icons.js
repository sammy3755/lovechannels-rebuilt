// Shared outline icons render consistently across browsers, including iOS.
const paths={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 member:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 services:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 bookings:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m5 5 3 3 5-5"/>',
 giving:'<path d="M2 12h4v9H2zM6 14l4-3h4a2 2 0 0 1 0 4h-3M6 20h9l6-6a2 2 0 0 0-3-2l-4 3"/><path d="M14 5c-2-3 1-5 3-3 2-2 5 0 3 3l-3 3z"/>',
 inbox:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 6 9 7 9-7"/>',
 content:'<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 13h8M8 17h8"/>',
 testimony:'<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="m9 10 2 2 4-4"/>',
 counseling:'<circle cx="8" cy="7" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 5 5v2"/>',
 wedding:'<circle cx="8" cy="14" r="6"/><circle cx="16" cy="14" r="6"/><path d="m12 3-2 3 2 3 2-3z"/>',
 birthday:'<path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M2 21h20M4 15c2 3 4-3 6 0s4-3 6 0 4-1 4-1M7 12V8M12 12V8M17 12V8M7 5V3M12 5V3M17 5V3"/>',
 'marriage-class':'<path d="M3 5h6l3 2 3-2h6v15h-6l-3 2-3-2H3zM12 7v15"/>',
 membership:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 9h6M20 6v6"/>',
 baptism:'<path d="M12 2s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11ZM9 14a3 3 0 0 0 3 3M2 22c3-3 4 1 7 0s4-3 7 0 4-1 6-1"/>',
 thanksgiving:'<path d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15M12 6C2 6 6-2 12 6Zm0 0c10 0 6-8 0 0Z"/>',
 dedication:'<circle cx="12" cy="13" r="8"/><path d="M9 12h.01M15 12h.01M9 16c2 2 4 2 6 0M12 5c-3-4 3-5 3-2"/>',
 foundation:'<path d="M3 4h6l3 2 3-2h6v16h-6l-3 2-3-2H3zM12 6v16M6 9h3M6 13h3M15 9h3M15 13h3"/>',
 leadership:'<path d="M3 21h18M5 21V12h4v9M10 21V7h4v14M15 21V3h4v18"/>',
 evangelism:'<path d="m3 10 14-6v14L3 14zM3 10v4M6 15l2 6h4l-2-5M21 7v8"/>'
};
export function icon(name,size=24){return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.content}</svg>`;}
