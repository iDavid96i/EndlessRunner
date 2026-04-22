/* ============================================================
   SKYLINE DASH — UI / Screen Router / Persistence
   Wires DOM buttons to the Game instance defined in game.js
   ============================================================ */

(() => {
'use strict';

const { Game, SKIN_COLORS, renderSkinPreview } = window.SkylineDash;

// ---------------- Persistence ----------------
const STORAGE_KEY = 'skyline-dash-v1';
const DEFAULTS = {
    bestDistance: 0,
    totalCoins: 0,
    selectedSkin: 'pink',
    ownedSkins: ['pink'],
    settings: { sfx: true, music: true, shake: true, particles: true },
    daily: { lastClaim: null, streak: 0 },
};

function loadSave() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULTS);
        const parsed = JSON.parse(raw);
        return { ...structuredClone(DEFAULTS), ...parsed,
            settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
            daily:    { ...DEFAULTS.daily,    ...(parsed.daily    || {}) },
            ownedSkins: parsed.ownedSkins && parsed.ownedSkins.length ? parsed.ownedSkins : ['pink'],
        };
    } catch (e) {
        return structuredClone(DEFAULTS);
    }
}
function saveSave() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {}
}
const save = loadSave();

// ---------------- Skin catalog ----------------
const SKINS = [
    { key: 'pink',   name: 'Blossom',  price: 0   },
    { key: 'cyan',   name: 'Pulse',    price: 200 },
    { key: 'neon',   name: 'Mint',     price: 350 },
    { key: 'sunset', name: 'Ember',    price: 500 },
    { key: 'royal',  name: 'Regal',    price: 750 },
    { key: 'shadow', name: 'Shade',    price: 1200 },
];

// ---------------- DOM refs ----------------
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const canvas = $('#game-canvas');

const screens = {
    menu:      $('#main-menu'),
    hud:       $('#hud'),
    pause:     $('#pause-menu'),
    gameover:  $('#game-over'),
    skins:     $('#skins-menu'),
    settings:  $('#settings-menu'),
    daily:     $('#daily-menu'),
};

// Ephemeral UI state
let hintVisible = true;

// ---------------- Screen routing ----------------
// The UI has two layers:
//   base: exactly one of 'menu' | 'hud'
//   overlay: zero or one of 'pause' | 'gameover' | 'skins' | 'settings' | 'daily'
// Modals always float on top of the base via z-index in CSS.
const OVERLAY_IDS = ['pause', 'gameover', 'skins', 'settings', 'daily'];
let currentBase = 'menu';
let currentOverlay = null;

function applyScreens() {
    for (const k of Object.keys(screens)) {
        const active = (k === currentBase) || (k === currentOverlay);
        screens[k].classList.toggle('active', active);
    }
}

function setBase(base) {
    currentBase = base;
    applyScreens();
}

function openOverlay(name) {
    if (!OVERLAY_IDS.includes(name)) return;
    currentOverlay = name;
    applyScreens();
}

function closeOverlay() {
    if (!currentOverlay) return;
    const was = currentOverlay;
    currentOverlay = null;
    applyScreens();
    return was;
}

// Back-compat shim used by some older call sites.
function setScreen(...keys) {
    const base = keys.find(k => k === 'menu' || k === 'hud') || currentBase;
    const overlay = keys.find(k => OVERLAY_IDS.includes(k)) || null;
    currentBase = base;
    currentOverlay = overlay;
    applyScreens();
}

// ---------------- Toast ----------------
let toastTimer = 0;
function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------------- Game instance ----------------
const game = new Game(canvas, {
    onStateChange(state) {
        if (state === 'playing') {
            setBase('hud');
            closeOverlay();
            if (hintVisible) $('#hint-overlay').classList.remove('hidden');
            else              $('#hint-overlay').classList.add('hidden');
        } else if (state === 'paused') {
            $('#pause-distance').textContent = Math.floor(game.distance) + ' m';
            $('#pause-coins').textContent = game.coins;
            setBase('hud');
            openOverlay('pause');
        } else if (state === 'gameover') {
            showGameOver();
        } else if (state === 'menu') {
            setBase('menu');
            closeOverlay();
            refreshMenu();
        }
    },
    onTick(s) {
        $('#hud-distance').textContent = s.distance;
        $('#hud-coins').textContent = s.coins;
        renderPowerupPills(s.powerups);
    },
    onAction(kind) {
        if (hintVisible) {
            hintVisible = false;
            $('#hint-overlay').classList.add('hidden');
        }
    },
    onCombo(n) {
        if (n < 3) return;
        const el = $('#combo-display');
        el.textContent = `×${n} COMBO!`;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 650);
    },
    onPowerup(kind, dur) {
        const labels = { shield: 'Shield', magnet: 'Magnet', boost: 'Speed Boost' };
        toast(`${labels[kind]}!`);
    },
    onShieldBreak() {
        toast('Shield broken!');
    },
    onHit() {
        const app = $('#app');
        app.classList.add('hit');
        setTimeout(() => app.classList.remove('hit'), 400);
        if (save.settings.shake) {
            app.classList.add('shaking');
            setTimeout(() => app.classList.remove('shaking'), 400);
        }
    },
});

// Apply settings to game
function applySettings() {
    game.audio.setSfx(save.settings.sfx);
    game.audio.setMusic(save.settings.music);
    game.shakeEnabled = !!save.settings.shake;
    game.particles.enabled = !!save.settings.particles;
    game.setSkin(save.selectedSkin);
}
applySettings();

// ---------------- Menu refresh ----------------
function refreshMenu() {
    $('#menu-best-score').textContent = save.bestDistance;
    $('#menu-coins').textContent = save.totalCoins;
    $('#skins-coins').textContent = save.totalCoins;
    $('#daily-notif').classList.toggle('active', canClaimDaily());
    // Only show the "Best" chip once the player has actually set a record.
    $('.best-score-chip').classList.toggle('hidden', save.bestDistance <= 0);
}

// ---------------- Powerup pills ----------------
const POWERUP_MAX = { shield: 7, magnet: 7, boost: 4 };
const POWERUP_LABEL = { shield: 'Shield', magnet: 'Magnet', boost: 'Boost' };

function renderPowerupPills(powerups) {
    const container = $('#hud-powerups');
    container.innerHTML = '';
    for (const k of ['shield', 'magnet', 'boost']) {
        const v = powerups[k];
        if (v <= 0) continue;
        const pill = document.createElement('div');
        pill.className = `powerup-pill ${k}`;
        pill.innerHTML = `
            <span class="pill-icon"></span>
            <span>${POWERUP_LABEL[k]}</span>
            <span class="pill-bar"><span class="pill-fill" style="transform:scaleX(${(v / POWERUP_MAX[k]).toFixed(3)})"></span></span>
        `;
        container.appendChild(pill);
    }
}

// ---------------- Game Over ----------------
function showGameOver() {
    const dist = Math.floor(game.distance);
    const isRecord = dist > save.bestDistance;
    if (isRecord) save.bestDistance = dist;
    save.totalCoins += game.coins;
    saveSave();

    $('#final-distance').textContent = dist;
    $('#final-best').textContent = save.bestDistance;
    $('#final-coins').textContent = game.coins;
    $('#final-total-coins').textContent = save.totalCoins;
    $('#new-record-badge').classList.toggle('show', isRecord);

    setBase('hud');
    openOverlay('gameover');
}

// ---------------- Skins ----------------
function renderSkinsGrid() {
    const grid = $('#skins-grid');
    grid.innerHTML = '';
    for (const skin of SKINS) {
        const owned = save.ownedSkins.includes(skin.key);
        const selected = save.selectedSkin === skin.key;
        const card = document.createElement('button');
        card.className = 'skin-card' + (selected ? ' selected' : '') + (!owned ? ' locked' : '');
        card.dataset.skin = skin.key;
        card.innerHTML = `
            <div class="skin-selected-tag">✓</div>
            <div class="skin-preview"><canvas></canvas></div>
            <div class="skin-name">${skin.name}</div>
            ${owned
                ? `<div class="skin-price" style="color: var(--text-dim)">${selected ? 'Selected' : 'Tap to use'}</div>`
                : `<div class="skin-price"><span class="coin-icon"></span>${skin.price}</div>`
            }
        `;
        card.addEventListener('click', () => onSkinTap(skin));
        grid.appendChild(card);

        const c = card.querySelector('canvas');
        // Ensure canvas has a size before rendering
        requestAnimationFrame(() => renderSkinPreview(c, skin.key));
    }
    $('#skins-coins').textContent = save.totalCoins;
}

function onSkinTap(skin) {
    if (save.ownedSkins.includes(skin.key)) {
        save.selectedSkin = skin.key;
        saveSave();
        game.setSkin(skin.key);
        renderSkinsGrid();
        toast(`${skin.name} equipped`);
    } else {
        if (save.totalCoins >= skin.price) {
            save.totalCoins -= skin.price;
            save.ownedSkins.push(skin.key);
            save.selectedSkin = skin.key;
            game.setSkin(skin.key);
            saveSave();
            renderSkinsGrid();
            refreshMenu();
            toast(`Unlocked: ${skin.name}`);
        } else {
            toast(`Need ${skin.price - save.totalCoins} more coins`);
        }
    }
}

// ---------------- Daily rewards ----------------
const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500]; // day 1..7

function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function daysBetween(a, b) {
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((new Date(b.getFullYear(), b.getMonth(), b.getDate()) -
                       new Date(a.getFullYear(), a.getMonth(), a.getDate())) / ms);
}
function canClaimDaily() {
    if (!save.daily.lastClaim) return true;
    const last = new Date(save.daily.lastClaim);
    return daysBetween(last, new Date()) >= 1;
}
function currentDailyIndex() {
    if (!save.daily.lastClaim) return 0;
    const last = new Date(save.daily.lastClaim);
    const diff = daysBetween(last, new Date());
    if (diff === 0) return (save.daily.streak - 1) % DAILY_REWARDS.length;  // already claimed today
    if (diff === 1) return save.daily.streak % DAILY_REWARDS.length;         // next in streak
    return 0;                                                                 // streak broken
}

function renderDailyGrid() {
    const grid = $('#daily-grid');
    grid.innerHTML = '';
    const todayIdx = currentDailyIndex();
    const claimedToday = !canClaimDaily();

    for (let i = 0; i < DAILY_REWARDS.length; i++) {
        const item = document.createElement('div');
        const isClaimed = i < todayIdx || (i === todayIdx && claimedToday);
        const isToday = i === todayIdx && !claimedToday;
        item.className = 'daily-item' + (isClaimed ? ' claimed' : '') + (isToday ? ' today' : '');
        item.innerHTML = `
            <div class="daily-check">✓</div>
            <div class="daily-day">Day ${i + 1}</div>
            <div class="daily-amount">+${DAILY_REWARDS[i]}</div>
            <div>coins</div>
        `;
        grid.appendChild(item);
    }

    const btn = $('#btn-claim-daily');
    if (canClaimDaily()) {
        btn.disabled = false;
        btn.textContent = `Claim +${DAILY_REWARDS[todayIdx]}`;
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-primary');
    } else {
        btn.disabled = true;
        btn.textContent = 'Come back tomorrow';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
    }
}

function claimDaily() {
    if (!canClaimDaily()) return;
    const idx = currentDailyIndex();
    const reward = DAILY_REWARDS[idx];
    const last = save.daily.lastClaim ? new Date(save.daily.lastClaim) : null;
    const diff = last ? daysBetween(last, new Date()) : 99;

    save.daily.streak = (diff === 1 ? save.daily.streak : 0) + 1;
    save.daily.lastClaim = new Date().toISOString();
    save.totalCoins += reward;
    saveSave();

    toast(`+${reward} coins claimed`);
    renderDailyGrid();
    refreshMenu();
}

// ---------------- Settings toggles ----------------
function bindToggle(id, key) {
    const el = $(id);
    el.checked = save.settings[key];
    el.addEventListener('change', () => {
        save.settings[key] = el.checked;
        saveSave();
        applySettings();
    });
}
bindToggle('#setting-sfx', 'sfx');
bindToggle('#setting-music', 'music');
bindToggle('#setting-shake', 'shake');
bindToggle('#setting-particles', 'particles');

$('#btn-reset-progress').addEventListener('click', () => {
    if (!confirm('Reset all progress? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(save, structuredClone(DEFAULTS));
    saveSave();
    applySettings();
    refreshMenu();
    renderSkinsGrid();
    toast('Progress reset');
});

// ---------------- Button wiring ----------------
$('#btn-play').addEventListener('click', () => {
    hintVisible = true;
    game.start();
});

$('#btn-pause').addEventListener('click', () => game.pause());
$('#btn-resume').addEventListener('click', () => {
    closeOverlay();
    game.resume();
});
$('#btn-restart').addEventListener('click', () => {
    hintVisible = false;
    game.start();
});
$('#btn-exit').addEventListener('click', () => game.gotoMenu());

$('#btn-retry').addEventListener('click', () => {
    hintVisible = false;
    game.start();
});
$('#btn-home').addEventListener('click', () => game.gotoMenu());

$('#btn-skins').addEventListener('click', () => {
    renderSkinsGrid();
    openOverlay('skins');
});
$('#btn-settings').addEventListener('click', () => openOverlay('settings'));
$('#btn-daily').addEventListener('click', () => {
    renderDailyGrid();
    openOverlay('daily');
});
$('#btn-claim-daily').addEventListener('click', claimDaily);

// ---------------- Universal close handling ----------------
// Tap on a modal's backdrop or its ✕ button closes / dismisses the overlay.
// The exact behavior depends on which overlay is open:
//   pause    → resume gameplay
//   gameover → return to main menu
//   skins/settings/daily → return to the main menu layer
function dismissOverlay() {
    const was = currentOverlay;
    if (!was) return;
    if (was === 'pause') {
        closeOverlay();
        game.resume();
    } else if (was === 'gameover') {
        closeOverlay();
        game.gotoMenu();
    } else {
        closeOverlay();
    }
}

// Any close button or backdrop tap dispatches to dismissOverlay.
$$('.close-btn, .modal-backdrop').forEach(el => {
    el.addEventListener('click', e => {
        const modal = e.currentTarget.closest('.modal-screen');
        if (!modal) return;
        // Ensure we only react to the currently-active overlay.
        if (!modal.classList.contains('active')) return;
        dismissOverlay();
    });
});

// Escape key: close overlay if any, else pause during gameplay.
window.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return;
    if (currentOverlay) {
        e.preventDefault();
        dismissOverlay();
    } else if (game.state === 'playing') {
        e.preventDefault();
        game.pause();
    }
});

// Hint overlay dismiss by tap
$('#hint-overlay').addEventListener('click', () => {
    hintVisible = false;
    $('#hint-overlay').classList.add('hidden');
});

// Pause on window blur — but only if we aren't already paused / in a menu,
// to avoid double-transitions that could leave the UI in a bad state.
window.addEventListener('blur', () => {
    if (game.state === 'playing') game.pause();
});

// ---------------- Boot ----------------
setBase('menu');
closeOverlay();
refreshMenu();
renderSkinsGrid();
renderDailyGrid();

})();
