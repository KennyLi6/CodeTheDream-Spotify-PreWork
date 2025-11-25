export const CLIENT_ID = '1e8524a3ff89495495111505875160d2';
// By default this will use the current page as the redirect URI.
export const REDIRECT_URI = window.location.origin + window.location.pathname;
export const SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'user-read-private'
].join(' ');
