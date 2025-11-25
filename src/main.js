import './style.css'
import {
	redirectToAuth,
	handleRedirectCallback,
	isAuthenticated,
	logout,
	getMe,
	getUserPlaylists,
	getCurrentPlayback,
	getPlaylistTracks
} from './spotify.js';

const loginBtn = document.getElementById('login-btn');
const displayName = document.getElementById('displayName');
const avatar = document.getElementById('avatar');
const content = document.getElementById('content');

function setLoggedOutUI() {
	displayName.textContent = '';
	avatar.innerHTML = '';
	loginBtn.textContent = 'Login with Spotify';
	content.innerHTML = '<p>Please log in to see your playlists and current track.</p>';
}

function setLoggedInUI() {
	loginBtn.textContent = 'Logout';
}

loginBtn.addEventListener('click', async () => {
	if (isAuthenticated()) {
		logout();
		setLoggedOutUI();
	} else {
		redirectToAuth();
	}
});

async function renderProfileAndData() {
	try {
		const me = await getMe();
		displayName.textContent = me.display_name || me.id;
		if (me.images && me.images.length) {
			avatar.innerHTML = `<img src="${me.images[0].url}" alt="avatar" width="64" />`;
		}

		const playlists = await getUserPlaylists();
		let html = '<h3>Your Playlists</h3>';
		html += '<ul>';
		for (const p of playlists.items) {
			html += `<li><button data-id="${p.id}" class="playlist-btn">${p.name} (${p.tracks.total})</button></li>`;
		}
		html += '</ul>';

		html += '<h3>Currently Playing</h3>';
		const now = await getCurrentPlayback();
		if (!now) {
			html += '<p>Nothing is currently playing.</p>';
		} else {
			const item = now.item;
			const artists = item.artists.map(a => a.name).join(', ');
			html += `<div><img src="${item.album.images[2]?.url || item.album.images[0].url}" width="64" />`;
			html += `<strong>${item.name}</strong> — ${artists}`;
			html += ` <em>on ${item.album.name}</em></div>`;
		}

		content.innerHTML = html;

		// attach playlist buttons
		document.querySelectorAll('.playlist-btn').forEach(btn => {
			btn.addEventListener('click', async (e) => {
				const id = e.currentTarget.dataset.id;
				const tracksResp = await getPlaylistTracks(id);
				let list = '<h4>Tracks</h4><ol>';
				for (const t of tracksResp.items) {
					const track = t.track;
					list += `<li>${track.name} — ${track.artists.map(a=>a.name).join(', ')}</li>`;
				}
				list += '</ol>';
				content.innerHTML = list;
			});
		});

		setLoggedInUI();
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


