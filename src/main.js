import './style.css'
import {
	redirectToAuth,
	handleRedirectCallback,
	isAuthenticated,
	logout,
	getUser,
	getUserPlaylists,
	getCurrentPlayback,
	getPlaylistTracks,
	playPlayback,
	pausePlayback
} from './spotify.js';

const LOGIN_BUTTON = document.getElementById('login-btn');
const DISPLAY_NAME = document.getElementById('displayName');
const AVATAR = document.getElementById('avatar');
const CONTENT = document.getElementById('content');
const POLLING_TIME = 10000; // 10 seconds

let playbackPollId = null;

// update only the "now playing" UI fragment
async function updateNowPlaying() {
  try {
    const now = await getCurrentPlayback();
    // Ensure an element exists to hold the currently playing info
    let currentPlayback = document.getElementById('now-playing');
    if (!currentPlayback) {
      currentPlayback = document.createElement('div');
      currentPlayback.id = 'now-playing';
      CONTENT.append(currentPlayback);
    }

    if (!now) {
		currentPlayback.innerHTML = '<p>Nothing is currently playing.</p>';
      return;
    }

    const item = now.item;
    const artists = (item.artists || []).map(a => a.name).join(', ');
    const image = item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || '';
		currentPlayback.innerHTML = `
			<div style="display:flex;align-items:center;gap:.5rem">
				${image ? `<img src="${image}" width="64" alt="album art">` : ''}
				<div>
					<div><strong>${item.name}</strong></div>
					<div style="font-size:.9rem;color:#666">${artists} — <em>${item.album?.name || ''}</em></div>
				</div>
			</div>
			<div style="margin-top: 0.5rem;">
				<button id="play-btn" style="margin-right: 0.5rem; padding: 0.5rem 1rem;">▶ Play</button>
				<button id="pause-btn" style="padding: 0.5rem 1rem;">⏸ Pause</button>
			</div>
		`;

		// attach play/pause listeners inside the same now-playing element
		const playBtn = currentPlayback.querySelector('#play-btn');
		const pauseBtn = currentPlayback.querySelector('#pause-btn');
		if (playBtn) {
			playBtn.onclick = async () => {
				try {
					await playPlayback();
					console.log('Playback started');
					await updateNowPlaying();
				} catch (err) {
					console.error('Play failed:', err);
				}
			};
		}
		if (pauseBtn) {
			pauseBtn.onclick = async () => {
				try {
					await pausePlayback();
					console.log('Playback paused');
					await updateNowPlaying();
				} catch (err) {
					console.error('Pause failed:', err);
				}
			};
		}
  } catch (err) {
    console.error('updateNowPlaying error', err);
    // Keep polling but consider backing off on repeated failures
  }
}

function startPlaybackPolling(interval = POLLING_TIME) {
  // clear any existing
  stopPlaybackPolling();
  let playbackPollInterval = interval;
  // run immediately then schedule
  updateNowPlaying();
  playbackPollId = setInterval(() => {
    // only poll if authenticated and page visible
    if (isAuthenticated() && !document.hidden) {
      updateNowPlaying();
    }
  }, playbackPollInterval);

  // pause polling on visibility change (optional extra safety)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // page hidden -> don't spam requests
      // we leave interval running but skip when hidden
    } else {
      // page became visible -> do immediate update
      if (isAuthenticated()) updateNowPlaying();
    }
  }, { once: false });
}

function stopPlaybackPolling() {
  if (playbackPollId) {
    clearInterval(playbackPollId);
    playbackPollId = null;
  }
}

function setLoggedOutUI() {
	DISPLAY_NAME.textContent = '';
	AVATAR.innerHTML = '';
	LOGIN_BUTTON.textContent = 'Login with Spotify';
	CONTENT.innerHTML = '<p>Please log in to see your playlists and current track.</p>';
}

function setLoggedInUI() {
	LOGIN_BUTTON.textContent = 'Logout';
}

LOGIN_BUTTON.addEventListener('click', async () => {
	if (isAuthenticated()) {
		logout();
		setLoggedOutUI();
	} else {
		redirectToAuth();
	}
});

async function renderProfileAndData() {
	try {
		const user = await getUser();
		DISPLAY_NAME.textContent = user.display_name || user.id;
		if (user.images && user.images.length) {
			AVATAR.innerHTML = `<img src="${user.images[0].url}" alt="avatar" width="64" />`;
		}

		const playlists = await getUserPlaylists();
		let html = '<h3>Your Playlists</h3>';
		html += '<ul>';
		for (const p of playlists.items) {
			html += `<li><button data-id="${p.id}" class="playlist-btn">${p.name} (${p.tracks.total})</button></li>`;
		}
		html += '</ul>';

		html += '<h3>Currently Playing</h3>';
		CONTENT.innerHTML = html;
		// render now-playing into the centralized element
		await updateNowPlaying();

		// TODO: Add previous/next buttons maybe a progress bar?

		// attach playlist buttons
		document.querySelectorAll('.playlist-btn').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				const id = e.currentTarget.dataset.id;
				const tracksResp = await getPlaylistTracks(id);
				let list = '<button id="back-btn" style="margin-bottom: 1rem; padding: 0.5rem 1rem;">← Back to Playlists</button>';
				list += '<h4>Tracks</h4><ol>';
				for (const t of tracksResp.items) {
					const track = t.track;
					list += `<li>${track.name} — ${track.artists.map(a=>a.name).join(', ')}</li>`;
				}
				list += '</ol>';
				CONTENT.innerHTML = list;

				// attach back button
				document.getElementById('back-btn').addEventListener('click', renderProfileAndData);
			});
		});

		setLoggedInUI();
		startPlaybackPolling(POLLING_TIME);
	} catch (err) {
		console.error(err);
		setLoggedOutUI();
	}
}

// On load handle possible redirect from Spotify
(async function init() {
	try {
		await handleRedirectCallback();
	} catch (err) {
		console.error('Auth callback error', err);
	}
	if (isAuthenticated()) {
		await renderProfileAndData();
	} else {
		setLoggedOutUI();
	}
})();


