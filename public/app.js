const loginScreen = document.querySelector('#login-screen');
const playerScreen = document.querySelector('#player-screen');
const emailStep = document.querySelector('#email-step');
const passwordStep = document.querySelector('#password-step');
const emailEl = document.querySelector('#email');
const passwordEl = document.querySelector('#password');
const emailError = document.querySelector('#email-error');
const passwordError = document.querySelector('#password-error');
const nextEmail = document.querySelector('#next-email');
const signIn = document.querySelector('#sign-in');
const passwordBack = document.querySelector('#password-back');
const tabsEl = document.querySelector('#tabs');
const channelListEl = document.querySelector('#channel-list');
const player = document.querySelector('#player');
const titleEl = document.querySelector('#track-title');
const authorEl = document.querySelector('#track-author');
const bgAuthorEl = document.querySelector('#bg-author');
const categoryArt = document.querySelector('#category-art');
const artAction = document.querySelector('.art-action');
const playLayout = document.querySelector('.play-layout');
const searchEl = document.querySelector('#search');
const libraryCountEl = document.querySelector('#library-count');
const modeNoteEl = document.querySelector('#mode-note');
const playerStatusEl = document.querySelector('#player-status');
const favoriteToggle = document.querySelector('#favorite-toggle');
const dislikeButton = document.querySelector('#dislike-button');
const likeButton = document.querySelector('#like-button');
const intensityToggle = document.querySelector('#intensity-toggle');
const mixButton = document.querySelector('#mix-button');
const tuneToggle = document.querySelector('#tune-toggle');
const tunerState = document.querySelector('#tuner-state');
const logoutButton = document.querySelector('#logout-button');
const variantPicker = document.querySelector('.variant-picker');
const variantSelect = document.querySelector('#variant-select');
const template = document.querySelector('#channel-template');

const BASE_PARAMS = {
  os: 'Android',
  application: 'Mubert',
  version: '4.2.2',
  language: 'en-US',
  sandbox: false,
};

let channels = [];
let activeTab = '';
let activeChannelId = '';
let activeStreamIndex = 0;
let searchQuery = '';
let lightModeOn = false;
let likeCount = 0;
let dislikeCount = 0;
const favoriteIds = new Set(JSON.parse(localStorage.getItem('mubert:favorites') || '[]'));
let rateTimer = null;

function setStep(step) {
  emailStep.classList.toggle('is-active', step === 'email');
  passwordStep.classList.toggle('is-active', step === 'password');
  if (step === 'email') emailEl.focus();
  if (step === 'password') passwordEl.focus();
}

function showPlayer() {
  loginScreen.hidden = true;
  playerScreen.hidden = false;
}

function showLogin(message = '') {
  loginScreen.hidden = false;
  playerScreen.hidden = true;
  setStep('email');
  emailError.textContent = message;
}

function setModeNote(message) {
  modeNoteEl.textContent = message;
}

function setStatus(message) {
  playerStatusEl.textContent = message;
}

async function mubertPost(path, method, params) {
  const response = await fetch(`/mubert-api/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json; charset=UTF-8', accept: 'application/json' },
    body: JSON.stringify({ ...BASE_PARAMS, method, params }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 0) {
    const message = data?.error?.text || data?.data?.text || `HTTP ${response.status}`;
    const error = new Error(message);
    error.data = data;
    throw error;
  }
  return data;
}

function absolutizeAsset(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://static.mubert.com${url}`;
  return `https://static.mubert.com/${url}`;
}

function firstImage(unit, stream) {
  return absolutizeAsset([
    unit?.image,
    unit?.mIcon,
    unit?.icon,
    unit?.backgrounds?.[0]?.url,
    unit?.backgrounds?.[0]?.data,
    stream?.backgrounds?.[0]?.url,
    stream?.backgrounds?.[0]?.data,
    'https://static.mubert.com/app/play/A-Relax@4x.png',
  ].find(Boolean));
}

function proxiedStreamUrl(url) {
  const parsed = new URL(url);
  return `/mubert-stream${parsed.pathname}${parsed.search}`;
}
function unitTypeName(type) {
  if (type === 3 || type === 'FAVES') return 'FAVES';
  if (type === 2 || type === 'SECRET') return 'SECRET';
  if (type === 1 || type === 'RANDOM') return 'RANDOM';
  return 'DEFAULT';
}


function flattenChannels(pagesData) {
  const pages = pagesData?.data?.pages || pagesData?.pages || [];
  const flattened = [];
  for (const page of pages) {
    for (const unit of page.units || []) {
      const streams = (unit.streams || []).map((stream, index) => {
        const id = String(stream.sid || `${unit.unid}-${index}`);
        return {
          id,
          sid: stream.sid || id,
          title: stream.title || unit.name || 'Untitled stream',
          author: stream.author || '',
          url: stream.url || '',
          proxyUrl: stream.url ? proxiedStreamUrl(stream.url) : '',
          deepLink: stream.redirect || stream.deepLink || '',
        };
      }).filter((stream) => stream.proxyUrl);
      const type = unitTypeName(unit.type);
      if (type === 'FAVES') favoriteIds.add(String(unit.unid));
      flattened.push({
        id: `${page.pid}:${unit.unid}`,
        unitId: String(unit.unid),
        pageId: page.pid,
        pageName: page.name || 'Mubert',
        name: unit.name || streams[0].title,
        playlist: unit.playlist || '',
        premium: Boolean(unit.premium),
        type,
        lightMode: unit.light_mode ?? unit.lightMode,
        image: firstImage(unit, streams[0]),
        streams,
      });
    }
  }
  return flattened;
}

function activeChannel() {
  return channels.find((channel) => channel.id === activeChannelId) || null;
}

function selectedStream(channel = activeChannel()) {
  return channel?.streams[Math.min(activeStreamIndex, channel.streams.length - 1)] || null;
}

function pageNames(items) {
  return [...new Set(items.map((channel) => channel.pageName || 'Mubert'))];
}

function channelsForTab() {
  const query = searchQuery.trim().toLowerCase();
  return channels.filter((channel) => {
    const tabMatches = !activeTab || (channel.pageName || 'Mubert') === activeTab;
    const text = `${channel.name} ${channel.pageName} ${channel.playlist} ${channel.streams.map((stream) => `${stream.title} ${stream.author}`).join(' ')}`.toLowerCase();
    return tabMatches && (!query || text.includes(query));
  });
}

function renderTabs() {
  const names = pageNames(channels);
  if (!activeTab || !names.includes(activeTab)) activeTab = names[0] || '';
  tabsEl.textContent = '';
  for (const name of names) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `tab${name === activeTab ? ' is-active' : ''}`;
    tab.textContent = name;
    tab.addEventListener('click', () => {
      activeTab = name;
      renderTabs();
      renderChannelList();
    });
    tabsEl.append(tab);
  }
}

function channelMeta(channel) {
  const parts = [];
  if (favoriteIds.has(channel.unitId)) parts.push('saved');
  if (channel.premium) parts.push('premium');
  if (channel.lightMode === 0) parts.push('no intensity');
  if (channel.streams.length > 1) parts.push(`${channel.streams.length} variants`);
  return parts.join(' · ') || channel.pageName || 'channel';
}

function renderChannelList() {
  const visible = channelsForTab();
  channelListEl.textContent = '';
  libraryCountEl.textContent = `${visible.length} of ${channels.length} channels`;
  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No channels match this view.';
    channelListEl.append(empty);
    return;
  }
  for (const channel of visible) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.id = channel.id;
    row.classList.toggle('is-active', channel.id === activeChannelId);
    row.classList.toggle('is-premium', channel.premium);
    row.querySelector('.channel-icon').style.backgroundImage = `url(${channel.image})`;
    row.querySelector('.channel-name').textContent = channel.name;
    row.querySelector('.channel-meta').textContent = channelMeta(channel);
    row.addEventListener('click', () => playChannel(channel));
    channelListEl.append(row);
  }
}

function renderControls() {
  const channel = activeChannel();
  const stream = selectedStream(channel);
  const hasChannel = Boolean(channel && stream);
  favoriteToggle.disabled = !hasChannel;
  dislikeButton.disabled = !hasChannel;
  likeButton.disabled = !hasChannel;
  mixButton.disabled = true;
  tuneToggle.disabled = !hasChannel;
  intensityToggle.disabled = !hasChannel || channel.lightMode === 0;
  const hasVariants = hasChannel && channel.streams.length > 1;
  variantSelect.disabled = !hasVariants;
  variantPicker.hidden = !hasVariants;
  favoriteToggle.textContent = favoriteIds.has(channel?.unitId) ? '★ Saved' : '☆ Save';
  intensityToggle.textContent = lightModeOn ? 'Intensity: Light' : 'Intensity: Normal';
  const tunedIn = !player.paused && !player.ended;
  const connecting = player.dataset.tuning === 'true';
  tuneToggle.textContent = tunedIn ? 'Tune out' : connecting ? 'Connecting…' : 'Tune in';
  artAction.textContent = tunedIn ? 'Tune out' : connecting ? 'Connecting' : 'Tune in';
  tunerState.lastChild.textContent = tunedIn ? ' On air' : connecting ? ' Connecting' : ' Off air';
  playLayout.classList.toggle('is-tuned-in', tunedIn);
  categoryArt.setAttribute('aria-label', `${tunedIn ? 'Tune out of' : 'Tune in to'} ${channel?.name || 'current station'}`);
  mixButton.textContent = 'Mix unavailable';

  variantSelect.textContent = '';
  if (channel) {
    channel.streams.forEach((candidate, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1}. ${candidate.title}${candidate.author ? ` · ${candidate.author}` : ''}`;
      option.selected = index === activeStreamIndex;
      variantSelect.append(option);
    });
  }
}

function renderAll(items) {
  channels = items;
  renderTabs();
  renderChannelList();
  if (!activeChannelId && channels.length) playChannel(channels[0], { autoplay: false });
}

function playChannel(channel, { autoplay = true, streamIndex = 0 } = {}) {
  const stream = channel.streams[Math.min(streamIndex, channel.streams.length - 1)];
  if (!stream) return;
  activeChannelId = channel.id;
  activeStreamIndex = Math.min(streamIndex, channel.streams.length - 1);
  lightModeOn = false;
  titleEl.textContent = channel.name;
  authorEl.textContent = [stream.title, stream.author].filter(Boolean).join(' · ') || channel.pageName;
  bgAuthorEl.textContent = channel.premium ? 'Premium channel' : channel.pageName;
  categoryArt.style.backgroundImage = `url(${channel.image})`;
  playLayout.classList.toggle('is-premium', channel.premium);
  player.src = stream.proxyUrl;
  setModeNote(channel.lightMode === 0
    ? 'This channel does not expose light/heavy intensity controls.'
    : 'Heavy mode active. Toggle light mode for a lighter generation.');
  renderChannelList();
  renderControls();
  if (autoplay) {
    player.dataset.tuning = 'true';
    renderControls();
    player.play().then(() => {
      delete player.dataset.tuning;
      setStatus(`Tuned in to ${channel.name}.`);
    }).catch((error) => {
      delete player.dataset.tuning;
      renderControls();
      setStatus(`Could not tune in: ${error.message}`);
    });
  }
}

async function loadChannels() {
  const data = await mubertPost('v2/AppGetPages', 'AppGetPages', { timestamp: 0 });
  renderAll(flattenChannels(data));
}

async function doLogin() {
  passwordError.textContent = '';
  signIn.disabled = true;
  signIn.textContent = 'Signing in…';
  try {
    await mubertPost('v2/AppStart', 'AppStart', []);
    await mubertPost('v2/Auth', 'Auth', { email: emailEl.value.trim(), password: passwordEl.value });
    await loadChannels();
    showPlayer();
  } catch (error) {
    passwordError.textContent = error.message;
  } finally {
    signIn.disabled = false;
    signIn.textContent = 'Next';
  }
}

async function toggleIntensity() {
  const channel = activeChannel();
  if (!channel || channel.lightMode === 0) return;
  const next = !lightModeOn;
  intensityToggle.disabled = true;
  try {
    await mubertPost('v2/AppLightMode', 'AppLightMode', { light_mode: next ? 'on' : 'off' });
    lightModeOn = next;
    setStatus(lightModeOn ? 'Light mode enabled.' : 'Heavy mode enabled.');
  } catch (error) {
    setStatus(`Intensity failed: ${error.message}`);
  } finally {
    renderControls();
  }
}

function sendRateSoon() {
  clearTimeout(rateTimer);
  rateTimer = setTimeout(async () => {
    const payload = { like: likeCount, dislike: dislikeCount, time: Math.floor(player.currentTime || 0) };
    try {
      await mubertPost('v2/AppSetRate', 'AppSetRate', payload);
      likeCount = 0;
      dislikeCount = 0;
      setStatus('Preference sent to Mubert.');
    } catch (error) {
      setStatus(`Preference failed: ${error.message}`);
    }
  }, 2000);
}

function rate(isLike) {
  if (!activeChannel()) return;
  if (isLike) likeCount += 1;
  else dislikeCount += 1;
  setStatus(isLike ? `Likes: +${likeCount}` : `Dislikes: +${dislikeCount}`);
  sendRateSoon();
}

async function toggleFavorite() {
  const channel = activeChannel();
  if (!channel) return;
  favoriteToggle.disabled = true;
  try {
    if (favoriteIds.has(channel.unitId)) {
      await mubertPost('v2/AppRemoveUnit', 'AppRemoveUnit', { pid: channel.pageId, unid: Number(channel.unitId) });
      favoriteIds.delete(channel.unitId);
      setStatus('Removed from saved channels.');
    } else {
      await mubertPost('v2/AppAddUnit', 'AppAddUnit', { pid: channel.pageId });
      favoriteIds.add(channel.unitId);
      setStatus('Saved channel.');
    }
    localStorage.setItem('mubert:favorites', JSON.stringify([...favoriteIds]));
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  } finally {
    renderChannelList();
    renderControls();
  }
}

async function mixStream() {
  const stream = selectedStream();
  if (!stream) return;
  mixButton.disabled = true;
  try {
    const data = await mubertPost('v2/AppMixStream', 'AppMixStream', { stream: stream.url });
    const seconds = data?.data?.time;
    setStatus(seconds ? `Mix updated for ${seconds} seconds.` : 'Mix updated.');
  } catch (error) {
    setStatus(`Mix failed: ${error.message}`);
  } finally {
    renderControls();
  }
}

function toggleTuning() {
  const channel = activeChannel();
  if (!channel) return;
  if (!player.paused) {
    player.pause();
    setStatus(`Tuned out of ${channel.name}.`);
    return;
  }
  player.dataset.tuning = 'true';
  renderControls();
  player.play().then(() => {
    delete player.dataset.tuning;
    setStatus(`Tuned in to ${channel.name}.`);
  }).catch((error) => {
    delete player.dataset.tuning;
    renderControls();
    setStatus(`Could not tune in: ${error.message}`);
  });
}

function clearCookies() {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

async function logout() {
  logoutButton.disabled = true;
  try {
    await mubertPost('v2/SignOut', 'SignOut', { device: 'current' });
  } catch {
    // Clear local session even if the remote logout request fails.
  }
  clearTimeout(rateTimer);
  clearCookies();
  localStorage.removeItem('mubert:favorites');
  localStorage.removeItem('mubert:lastEmail');
  channels = [];
  activeTab = '';
  activeChannelId = '';
  activeStreamIndex = 0;
  player.pause();
  player.removeAttribute('src');
  player.load();
  showLogin();
  logoutButton.disabled = false;
}

nextEmail.addEventListener('click', () => {
  emailError.textContent = '';
  if (!emailEl.checkValidity()) {
    emailError.textContent = 'Enter a valid email';
    return;
  }
  setStep('password');
});

emailEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') nextEmail.click();
});
passwordEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') doLogin();
});
signIn.addEventListener('click', doLogin);
passwordBack.addEventListener('click', () => setStep('email'));
searchEl.addEventListener('input', () => {
  searchQuery = searchEl.value;
  renderChannelList();
});
variantSelect.addEventListener('change', () => {
  const channel = activeChannel();
  if (channel) playChannel(channel, { streamIndex: Number(variantSelect.value) || 0 });
});
favoriteToggle.addEventListener('click', toggleFavorite);
dislikeButton.addEventListener('click', () => rate(false));
likeButton.addEventListener('click', () => rate(true));
intensityToggle.addEventListener('click', toggleIntensity);
mixButton.addEventListener('click', mixStream);
tuneToggle.addEventListener('click', toggleTuning);
categoryArt.addEventListener('click', toggleTuning);
player.addEventListener('play', renderControls);
player.addEventListener('playing', () => {
  delete player.dataset.tuning;
  renderControls();
});
player.addEventListener('pause', renderControls);
player.addEventListener('ended', renderControls);
player.addEventListener('waiting', renderControls);
player.addEventListener('stalled', () => {
  renderControls();
  setStatus('Signal interrupted. Reconnecting…');
});
player.addEventListener('error', () => {
  delete player.dataset.tuning;
  renderControls();
  setStatus('This station is currently unavailable.');
});
logoutButton.addEventListener('click', logout);

async function bootstrap() {
  localStorage.removeItem('mubert:lastEmail');
  emailEl.value = '';
  try {
    await loadChannels();
    showPlayer();
    return;
  } catch {
    // No relay-local cookie yet, or it expired. Show login.
  }
  showLogin();
}

bootstrap();
