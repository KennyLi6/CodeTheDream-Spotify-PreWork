export const CLIENT_ID = '1e8524a3ff89495495111505875160d2';
// By default this will use the current page as the redirect URI.
// Normalize redirect URI: if the page URL contains "index.html" remove it so the
// redirect URI matches the common GitHub Pages pattern (trailing slash).
export const REDIRECT_URI = (window.location.origin + window.location.pathname).replace(/index\.html$/, '');
export const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'playlist-read-private',
  'user-read-private'
].join(' ');
