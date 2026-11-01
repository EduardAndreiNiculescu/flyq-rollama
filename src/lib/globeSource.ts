import { GLOBE_HTML } from './globeHtml';

/** WebView source of the iOS globe: the page is a string in the app; the base URL only gives it an https origin for the tile requests */
export const GlobeHtmlSource = { html: GLOBE_HTML, baseUrl: 'https://flyq.local/' };
