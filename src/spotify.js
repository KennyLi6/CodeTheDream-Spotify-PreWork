import { CLIENT_ID, REDIRECT_URI, SCOPES } from './config.js';

const TOKEN_STORAGE_KEY = 'spotify_auth';

function generateRandomString(length = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let out = '';
  for (let i = 0; i < values.length; i++) {
    out += charset[values[i] % charset.length];
  }
  return out;
}

function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Convert to base64
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

function saveAuth(data) {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data));
}

function loadAuth() {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function redirectToAuth() {
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('pkce_verifier', verifier);
  const state = generateRandomString(16);
  localStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  // helpful debug output when testing in the browser or on GitHub Pages
  console.log('Redirecting to Spotify authorize URL:', url);
  // perform the navigation
  window.location.href = url;
}

export async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const storedState = localStorage.getItem('pkce_state');
  if (code) {
    // tidy URL
    history.replaceState({}, document.title, window.location.pathname);
    if (state !== storedState) {
      throw new Error('Invalid state from Spotify auth');
    }
    localStorage.removeItem('pkce_state');
    await exchangeCodeForToken(code);
  }
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('pkce_verifier');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier
  });

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Token exchange failed');
  const expires_at = Date.now() + data.expires_in * 1000;
  saveAuth({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at });
  localStorage.removeItem('pkce_verifier');
}

async function refreshToken() {
  const auth = loadAuth();
  if (!auth || !auth.refresh_token) throw new Error('No refresh token available');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
    client_id: CLIENT_ID
  });

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Refresh failed');
  const expires_at = Date.now() + data.expires_in * 1000;
  // Spotify may or may not return a refresh token on refresh; keep the old one if not provided
  saveAuth({ access_token: data.access_token, refresh_token: data.refresh_token || auth.refresh_token, expires_at });
}

async function ensureTokenValid() {
  const auth = loadAuth();
  if (!auth) return false;
  if (Date.now() > auth.expires_at - 60000) {
    await refreshToken();
  }
  return true;
}

async function fetchWithToken(input, init = {}) {
  const validToken = await ensureTokenValid();
  if (!validToken) throw new Error('Not authenticated');
  const auth = loadAuth();
  init.headers = Object.assign({}, init.headers, { Authorization: `Bearer ${auth.access_token}` });
  const resp = await fetch(input, init);
  if (resp.status === 401) {
    // try refresh and retry once
    await refreshToken();
    const auth2 = loadAuth();
    init.headers = Object.assign({}, init.headers, { Authorization: `Bearer ${auth2.access_token}` });
    return fetch(input, init);
  }
  return resp;
}

export function isAuthenticated() {
  const auth = loadAuth();
  return !!(auth && auth.access_token);
}

export function logout() {
  clearAuth();
}

export async function getUser() {
  const resp = await fetchWithToken('https://api.spotify.com/v1/me');
  if (!resp.ok) throw new Error('Failed to fetch profile');
  return resp.json();
}

export async function getUserPlaylists(limit = 50) {
  const resp = await fetchWithToken(`https://api.spotify.com/v1/me/playlists?limit=${limit}`);
  if (!resp.ok) throw new Error('Failed to fetch playlists');
  return resp.json();
}

export async function getPlaylistTracks(playlistId, limit = 100) {
  const resp = await fetchWithToken(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`);
  if (!resp.ok) throw new Error('Failed to fetch playlist tracks');
  return resp.json();
}

export async function getCurrentPlayback() {
  const resp = await fetchWithToken('https://api.spotify.com/v1/me/player/currently-playing');
  if (resp.status === 204) return null; // nothing playing
  if (!resp.ok) throw new Error('Failed to fetch currently playing');
  return resp.json();
}

export async function playPlayback() {
  const resp = await fetchWithToken('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!resp.ok) throw new Error('Failed to play');
}

export async function pausePlayback() {
  const resp = await fetchWithToken('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!resp.ok) throw new Error('Failed to pause');
}
