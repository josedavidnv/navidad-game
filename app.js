import { DEFAULT_ACTIONS, shuffle, makeRoomCode, pickRandom } from "./actions.js";

// Firebase (CDN modular, ES modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase, ref, onValue, set, update, get, push, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normName(s) {
    return String(s || "").trim().toLowerCase();
}

function setSubtitleVisible(visible) {
    const el = $("subtitle");
    if (!el) return;
    el.style.display = visible ? "" : "none";
}

function openNoActionsOverlay(isHostNow) {
    show("overlayNoActions");
    $("overlayBtnsHost").style.display = isHostNow ? "flex" : "none";
    $("overlayBtnsUser").style.display = isHostNow ? "none" : "flex";
}

function closeNoActionsOverlay() {
    hide("overlayNoActions");
}

// ---------- Local UX prefs (snow/sound/theme/music/snowSpeed) ----------
const LS = {
    snow: "xmas_snow_enabled",
    sound: "xmas_sound_enabled",
    theme: "xmas_theme",      // "dark" | "light"
    music: "xmas_music_enabled",
    snowSpeed: "xmas_snow_speed" // number string
};

function getBoolLS(key, fallback = true) {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1";
}
function setBoolLS(key, val) { localStorage.setItem(key, val ? "1" : "0"); }

function getThemeLS() { return localStorage.getItem(LS.theme) || "dark"; }
function setThemeLS(v) { localStorage.setItem(LS.theme, v); }

function getSnowSpeedLS() {
    const raw = localStorage.getItem(LS.snowSpeed);
    if (raw === null || raw === "") {
        // default: 20%
        return 0.2;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1.6, Math.max(0.2, n)) : 0.2;
}

function setSnowSpeedLS(v) {
    const n = Math.min(1.6, Math.max(0.2, Number(v)));
    localStorage.setItem(LS.snowSpeed, String(n));
}

function canSound() { return getBoolLS(LS.sound, true); }

// ---------- Tiny sounds (WebAudio, no files) ----------
let audioCtx = null;
function beep(freq = 660, durMs = 40, type = "sine", gainVal = 0.045) {
    if (!canSound()) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + durMs / 1000 + 0.01);
    } catch { /* ignore */ }
}
function clickSound() { beep(740, 25, "triangle", 0.035); }
function successSound() { beep(880, 45, "sine", 0.045); }
function toggleSoundFx(on) { on ? beep(700, 40, "sine", 0.045) : beep(220, 50, "sine", 0.03); }

// ---------- Theme apply ----------
function applyThemeFromLS() {
    const theme = getThemeLS();
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    $("toggleTheme").textContent = theme === "light" ? "Claro" : "Oscuro";
}
applyThemeFromLS();

// ---------- Background music (HTMLAudio, needs user gesture) ----------
const bgMusic = $("bgMusic");
let musicUnlocked = false;

function isMusicEnabled() { return getBoolLS(LS.music, false); }
function setMusicEnabled(v) { setBoolLS(LS.music, v); }

async function tryPlayMusic() {
    if (!bgMusic) return;
    if (!isMusicEnabled()) return;
    try {
        bgMusic.volume = 0.35;
        await bgMusic.play();
    } catch {
        // autoplay blocked until gesture; handled by unlock
    }
}

function stopMusic() {
    if (!bgMusic) return;
    try { bgMusic.pause(); } catch { /* ignore */ }
}

function updateMusicBtn() {
    const on = isMusicEnabled();
    $("toggleMusic").textContent = on ? "ON" : "OFF";
}

function unlockMusicOnFirstGesture() {
    if (musicUnlocked) return;
    musicUnlocked = true;
    // try start if enabled
    tryPlayMusic();
    // remove listeners
    window.removeEventListener("pointerdown", unlockMusicOnFirstGesture, { capture: true });
    window.removeEventListener("keydown", unlockMusicOnFirstGesture, { capture: true });
}
window.addEventListener("pointerdown", unlockMusicOnFirstGesture, { capture: true, once: false });
window.addEventListener("keydown", unlockMusicOnFirstGesture, { capture: true, once: false });

// ---------- Corner panel ----------
(function initCornerPanel() {
    const btn = $("cornerToggleBtn");
    const panel = $("cornerPanel");

    const snowOn = getBoolLS(LS.snow, true);
    const soundOn = getBoolLS(LS.sound, true);

    $("toggleSnow").textContent = snowOn ? "ON" : "OFF";
    $("toggleSound").textContent = soundOn ? "ON" : "OFF";
    updateMusicBtn();

    // snow speed UI
    const speedInput = $("snowSpeed");
    if (speedInput) {
        speedInput.value = String(getSnowSpeedLS());
        speedInput.addEventListener("input", () => {
            setSnowSpeedLS(speedInput.value);
        });
        speedInput.addEventListener("change", () => {
            clickSound();
        });
    }

    applyThemeFromLS();

    btn.addEventListener("click", () => {
        clickSound();
        panel.classList.toggle("hidden");
    });

    $("toggleSnow").addEventListener("click", () => {
        clickSound();
        const next = !getBoolLS(LS.snow, true);
        setBoolLS(LS.snow, next);
        $("toggleSnow").textContent = next ? "ON" : "OFF";
        if (next) startSnow();
        else stopSnow();
    });

    $("toggleSound").addEventListener("click", () => {
        const next = !getBoolLS(LS.sound, true);
        setBoolLS(LS.sound, next);
        $("toggleSound").textContent = next ? "ON" : "OFF";
        toggleSoundFx(next);
    });

    $("toggleMusic").addEventListener("click", async () => {
        clickSound();
        const next = !isMusicEnabled();
        setMusicEnabled(next);
        updateMusicBtn();
        if (next) await tryPlayMusic();
        else stopMusic();
    });

    $("toggleTheme").addEventListener("click", () => {
        clickSound();
        const cur = getThemeLS();
        const next = cur === "light" ? "dark" : "light";
        setThemeLS(next);
        applyThemeFromLS();
    });

    // click outside closes (optional)
    window.addEventListener("click", (e) => {
        if (panel.classList.contains("hidden")) return;
        if (e.target === btn || panel.contains(e.target)) return;
        panel.classList.add("hidden");
    });
})();

// ---------- Snow (canvas particles, seamless) ----------
let snowRAF = null;
let snowParticles = [];
let snowLastT = 0;

function resizeSnow() {
    const c = $("snowCanvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = "100vw";
    c.style.height = "100vh";
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeSnowParticle() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 2.2,
        vx: -0.12 + Math.random() * 0.24,
        vy: 0.22 + Math.random() * 0.60, // más lenta base
        a: 0.35 + Math.random() * 0.55
    };
}

function ensureSnowParticles() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = Math.max(90, Math.floor((w * h) / 14000)); // densidad
    if (snowParticles.length < target) {
        for (let i = snowParticles.length; i < target; i++) snowParticles.push(makeSnowParticle());
    } else if (snowParticles.length > target) {
        snowParticles.length = target;
    }
}

function stepSnow(ts) {
    snowRAF = requestAnimationFrame(stepSnow);

    const c = $("snowCanvas");
    const ctx = c.getContext("2d");
    const w = window.innerWidth;
    const h = window.innerHeight;

    const dt = Math.min(24, ts - (snowLastT || ts)); // clamp más estricto = menos “saltos” y menos velocidad aparente
    snowLastT = ts;

    const speed = getSnowSpeedLS();

    ensureSnowParticles();
    ctx.clearRect(0, 0, w, h);

    for (const p of snowParticles) {
        p.x += p.vx * dt * speed;
        p.y += p.vy * dt * speed;

        // sway leve
        p.x += Math.sin((p.y / 70) + (ts / 1800)) * 0.08 * speed;

        if (p.y > h + 8) { p.y = -8; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function startSnow() {
    if (!getBoolLS(LS.snow, true)) return;
    resizeSnow();
    ensureSnowParticles();
    if (snowRAF) cancelAnimationFrame(snowRAF);
    snowLastT = 0;
    snowRAF = requestAnimationFrame(stepSnow);
}
function stopSnow() {
    if (snowRAF) cancelAnimationFrame(snowRAF);
    snowRAF = null;
    const c = $("snowCanvas");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", () => {
    resizeSnow();
});

if (getBoolLS(LS.snow, true)) startSnow();
else stopSnow();

// ---------- Firebase init ----------
if (!window.FIREBASE_CONFIG) {
    alert("Falta firebaseConfig.js (window.FIREBASE_CONFIG). Créalo y rellénalo.");
    throw new Error("Missing FIREBASE_CONFIG");
}
const fbApp = initializeApp(window.FIREBASE_CONFIG);
const db = getDatabase(fbApp);

// ---------- State ----------
let roomCode = null;
let playerId = null;
let playerName = null;
let isHost = false;
let roomUnsub = null;
let leavingNow = false; // <-- para NO mostrar “sala borrada”

let heartbeatTimer = null;

function roomRef(path = "") {
    return ref(db, `rooms/${roomCode}${path ? "/" + path : ""}`);
}
function nowRoom() { return roomCode; }

// ---------- Screen switching ----------
function goLanding() {
    roomCode = null;
    playerId = null;
    playerName = null;
    isHost = false;
    leavingNow = false;

    stopHeartbeat();
    setSubtitleVisible(true);

    hide("screen-lobby");
    hide("screen-game");
    hide("overlayNoActions");
    show("screen-landing");
}

function goLobby() {
    setSubtitleVisible(true);
    hide("screen-landing");
    hide("screen-game");
    hide("overlayNoActions");
    show("screen-lobby");
}

function goGame() {
    setSubtitleVisible(false);
    hide("screen-landing");
    hide("screen-lobby");
    show("screen-game");
}

// ---------- Presence helpers ----------
function nowMs() { return Date.now(); }

// “online” si lastSeen hace menos de X
const ONLINE_WINDOW_MS = 2 * 60 * 1000; // 2 min

function isOnlinePlayer(p) {
    const t = p?.lastSeen;
    if (!t) return false;
    return (nowMs() - t) <= ONLINE_WINDOW_MS;
}

function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}

function startHeartbeat() {
    stopHeartbeat();
    if (!roomCode || !playerId) return;

    const beat = async () => {
        try {
            await update(roomRef(`players/${playerId}`), {
                lastSeen: serverTimestamp(),
                online: true,
                inRoom: true
            });
        } catch { /* ignore */ }
    };

    beat();
    heartbeatTimer = setInterval(beat, 25000); // 25s
}

// ---------- Room utils ----------
async function createRoom() {
    for (let i = 0; i < 8; i++) {
        const code = makeRoomCode();
        const r = ref(db, `rooms/${code}`);
        const snap = await get(r);
        if (!snap.exists()) {
            roomCode = code;

            const initial = {
                createdAt: serverTimestamp(),
                phase: "lobby",          // lobby | game
                hostPlayerId: null,
                settings: {
                    noRepeat: true,
                    useWildcard: false, // <-- por defecto: SIN comodín
                    lockJoin: true,
                    punishment: "Castigo: 1 chupito (o 20 sentadillas 😅)"
                },
                actions: {
                    baseCount: DEFAULT_ACTIONS.length,
                    custom: [],
                    disabled: {} // actionText -> true
                },
                game: {
                    round: 0,
                    wildcardPlayerId: null,
                    usedActions: {},
                    assignments: {},
                    lastRotationAt: null,
                    outOfActions: false
                }
            };

            await set(r, initial);
            return;
        }
    }
    alert("No he podido crear la sala (colisión de códigos). Prueba otra vez.");
}

async function joinRoom(code) {
    roomCode = code.toUpperCase().trim();
    const snap = await get(roomRef());
    if (!snap.exists()) {
        alert("Esa sala no existe.");
        roomCode = null;
        return null;
    }
    return snap.val();
}

async function ensureHost() {
    const snap = await get(roomRef("hostPlayerId"));
    const hostId = snap.val();
    isHost = (hostId === playerId);
    if (!hostId) {
        await set(roomRef("hostPlayerId"), playerId);
        isHost = true;
    }
}

// ---------- Player join / rejoin + unique names ----------
function findPlayerIdByName(roomData, name) {
    const players = roomData.players || {};
    const target = normName(name);
    for (const [pid, p] of Object.entries(players)) {
        if (normName(p?.name) === target) return pid;
    }
    return null;
}

function isNameTakenByOtherInRoom(roomData, name, myExistingPid = null) {
    const players = roomData.players || {};
    const target = normName(name);
    for (const [pid, p] of Object.entries(players)) {
        if (!p) continue;
        if (myExistingPid && pid === myExistingPid) continue;
        if (normName(p.name) === target && p.inRoom) return pid;
    }
    return null;
}

async function addNewPlayerToRoom() {
    const playersPath = roomRef("players");
    const newRef = push(playersPath);
    playerId = newRef.key;

    await set(newRef, {
        name: playerName,
        joinedAt: serverTimestamp(),
        inRoom: true,
        online: true,
        lastSeen: serverTimestamp(),
        leftAt: null
    });

    // OJO: en móvil esto saltará al bloquear/pasar a background. Está bien:
    // no “sale” de la sala (inRoom sigue true), solo marca online false.
    onDisconnect(newRef).update({
        online: false,
        lastSeen: serverTimestamp()
    });
}

async function reconnectExistingPlayer(existingPid) {
    playerId = existingPid;
    await update(roomRef(`players/${playerId}`), {
        inRoom: true,
        online: true,
        lastSeen: serverTimestamp(),
        leftAt: null
    });
    onDisconnect(roomRef(`players/${playerId}`)).update({
        online: false,
        lastSeen: serverTimestamp()
    });
}

async function enterRoomFlow(roomData) {
    const existingPid = findPlayerIdByName(roomData, playerName);
    const takenPid = isNameTakenByOtherInRoom(roomData, playerName, existingPid);
    if (takenPid) {
        alert("Ese nombre ya lo está usando alguien en la sala. Elige otro 🙂");
        return false;
    }

    const phase = roomData.phase || "lobby";
    const lockJoin = !!roomData.settings?.lockJoin;

    // Si está en game, permitimos entrar solo si ya existía ese jugador (rejoin)
    if (phase === "game" && lockJoin && !existingPid) {
        alert("La partida ya ha empezado y la sala está cerrada. No se pueden unir nuevos jugadores.");
        return false;
    }

    if (existingPid) await reconnectExistingPlayer(existingPid);
    else await addNewPlayerToRoom();

    await ensureHost();
    subscribeRoom();
    startHeartbeat();
    return true;
}

// ---------- Actions pool (RESPETA disabled) ----------
function getAllActions(roomData) {
    const custom = (roomData.actions?.custom || []).filter(Boolean);
    const setAll = new Set([...DEFAULT_ACTIONS, ...custom]);
    return [...setAll];
}

function getDisabledMap(roomData) {
    return roomData.actions?.disabled || {};
}

function buildEnabledPool(roomData) {
    const all = getAllActions(roomData);
    const disabled = getDisabledMap(roomData);
    return all.filter(a => !disabled[a]);
}

function computeActionCounts(roomData) {
    const all = getAllActions(roomData);
    const disabled = getDisabledMap(roomData);
    const total = all.length;
    let disabledCount = 0;
    for (const a of all) if (disabled[a]) disabledCount++;
    const enabled = total - disabledCount;
    return { total, enabled, disabled: disabledCount };
}

function renderActionCounts(roomData) {
    const c = computeActionCounts(roomData);
    const txt = `Total: ${c.total} · Activas: ${c.enabled} · Off: ${c.disabled}`;

    const ids = ["actionsCountsLobby", "actionsCountsLobby2", "actionsCountsGame", "actionsCountsGame2"];
    for (const id of ids) {
        const el = $(id);
        if (el) el.textContent = txt;
    }
}

// ---------- Game logic helpers ----------
function getInRoomIds(roomData) {
    const players = roomData.players || {};
    return Object.keys(players).filter(pid => players[pid]?.inRoom);
}

function computeAllExecuted(roomData) {
    const assignments = roomData.game?.assignments || {};
    const players = roomData.players || {};
    const inRoomIds = Object.keys(players).filter(pid => players[pid]?.inRoom);

    if (inRoomIds.length === 0) return false;

    for (const pid of inRoomIds) {
        const a = assignments[pid];
        if (!a || !a.action) return false;
        if (!a.executed) return false;
    }
    return true;
}

function pickAction(roomData, pool, usedActions, noRepeat) {
    if (!pool.length) return { action: null, outOfActions: true };

    if (!noRepeat) {
        return { action: pickRandom(pool), outOfActions: false };
    }

    const unused = pool.filter(a => !usedActions[a]);
    if (!unused.length) {
        return { action: null, outOfActions: true };
    }
    return { action: pickRandom(unused), outOfActions: false };
}

function autoDisableIfNoRepeat(updates, roomData, action) {
    const noRepeat = !!roomData.settings?.noRepeat;
    if (!noRepeat) return;
    updates[`game/usedActions/${action}`] = true;
    updates[`actions/disabled/${action}`] = true;
}

async function startGame(roomData) {
    if (!isHost) return;

    const inRoomIds = getInRoomIds(roomData);
    if (inRoomIds.length < 2) {
        alert("Mínimo 2 jugadores para empezar.");
        return;
    }

    // VALIDACIÓN: acciones activas >= jugadores
    const poolEnabled = buildEnabledPool(roomData);
    if (poolEnabled.length < inRoomIds.length) {
        alert(`No puedes empezar: hay ${inRoomIds.length} jugadores y solo ${poolEnabled.length} acciones activas.\nActiva más acciones o añade nuevas.`);
        return;
    }

    const useWildcard = !!roomData.settings?.useWildcard;
    const wildcardPlayerId = useWildcard ? pickRandom(inRoomIds) : null;

    const pool = poolEnabled;
    const noRepeat = !!roomData.settings?.noRepeat;
    const usedActions = { ...(roomData.game?.usedActions || {}) };

    const updates = {};
    updates["phase"] = "game";
    updates["game/round"] = 1;
    updates["game/wildcardPlayerId"] = wildcardPlayerId;
    updates["game/lastRotationAt"] = serverTimestamp();
    updates["game/outOfActions"] = false;
    updates["game/assignments"] = {};

    const assignments = {};
    const order = shuffle([...inRoomIds]);

    for (const pid of order) {
        const pick = pickAction(roomData, pool, usedActions, noRepeat);
        if (pick.outOfActions || !pick.action) {
            updates["game/outOfActions"] = true;
            break;
        }
        assignments[pid] = {
            action: pick.action,
            executed: false,
            isWildcard: (wildcardPlayerId ? pid === wildcardPlayerId : false)
        };
        if (noRepeat) usedActions[pick.action] = true;
    }

    if (updates["game/outOfActions"]) {
        updates["game/assignments"] = assignments;
        updates["game/usedActions"] = usedActions;
        await update(roomRef(), updates);
        return;
    }

    updates["game/assignments"] = assignments;

    delete updates["game/usedActions"];
    for (const pid of Object.keys(assignments)) {
        const action = assignments[pid].action;
        if (noRepeat) {
            autoDisableIfNoRepeat(updates, roomData, action);
        }
    }

    await update(roomRef(), updates);
}

async function nextRound(roomData) {
    if (!isHost) return;
    if (!computeAllExecuted(roomData)) return;

    const inRoomIds = getInRoomIds(roomData);
    if (inRoomIds.length < 1) return;

    const useWildcard = !!roomData.settings?.useWildcard;
    const noRepeat = !!roomData.settings?.noRepeat;
    const usedActions = { ...(roomData.game?.usedActions || {}) };

    const pool = buildEnabledPool(roomData);
    const oldWildcard = roomData.game?.wildcardPlayerId || null;

    let newWildcard = null;
    if (useWildcard) {
        const candidates = inRoomIds.filter(pid => pid !== oldWildcard);
        newWildcard = candidates.length ? pickRandom(candidates) : pickRandom(inRoomIds);
    }

    const newAssignments = {};
    const order = shuffle([...inRoomIds]);

    for (const pid of order) {
        const pick = pickAction(roomData, pool, usedActions, noRepeat);
        if (pick.outOfActions || !pick.action) {
            const updates = {
                "game/outOfActions": true,
                "game/lastRotationAt": serverTimestamp()
            };
            await update(roomRef(), updates);
            return;
        }

        newAssignments[pid] = {
            action: pick.action,
            executed: false,
            isWildcard: (useWildcard ? pid === newWildcard : false)
        };
        if (noRepeat) usedActions[pick.action] = true;
    }

    const updates = {
        "game/round": (roomData.game?.round || 0) + 1,
        "game/wildcardPlayerId": (useWildcard ? newWildcard : null),
        "game/lastRotationAt": serverTimestamp(),
        "game/outOfActions": false,
        "game/assignments": newAssignments
    };

    if (noRepeat) {
        for (const pid of Object.keys(newAssignments)) {
            const action = newAssignments[pid].action;
            updates[`game/usedActions/${action}`] = true;
            updates[`actions/disabled/${action}`] = true;
        }
    }

    await update(roomRef(), updates);
}

// ---------- Room cleanup (destroy if empty) ----------
async function maybeDestroyRoomIfEmpty() {
    if (!roomCode) return;
    const snap = await get(roomRef());
    if (!snap.exists()) return;
    const data = snap.val();
    const players = data.players || {};
    const inRoomCount = Object.values(players).filter(p => p?.inRoom).length;
    if (inRoomCount === 0) await set(roomRef(), null);
}

async function leaveRoomAndMaybeDestroy() {
    leavingNow = true;
    clickSound();
    stopHeartbeat();

    if (roomCode && playerId) {
        try {
            // Salir explícito: aquí sí marcamos inRoom:false
            await update(roomRef(`players/${playerId}`), {
                inRoom: false,
                online: false,
                leftAt: serverTimestamp(),
                lastSeen: serverTimestamp()
            });
        } catch { /* ignore */ }
        try { await maybeDestroyRoomIfEmpty(); } catch { /* ignore */ }
    }
    goLanding();
}

// ---------- Host: remove player ----------
async function hostRemovePlayer(pid) {
    if (!roomCode || !isHost) return;
    if (!pid) return;

    const snap = await get(roomRef());
    const data = snap.val();
    if (!data) return;

    // No auto-kick al host (pero si quieres, quita este guard)
    if (data.hostPlayerId === pid) {
        alert("No puedes eliminar al host.");
        return;
    }

    clickSound();

    const updates = {};
    updates[`players/${pid}/inRoom`] = false;
    updates[`players/${pid}/online`] = false;
    updates[`players/${pid}/leftAt`] = serverTimestamp();
    updates[`players/${pid}/lastSeen`] = serverTimestamp();

    // Quitarlo de asignaciones para no bloquear rondas
    updates[`game/assignments/${pid}`] = null;

    await update(roomRef(), updates);
    await maybeDestroyRoomIfEmpty();
}

// ---------- Host visibility ----------
function renderHostVisibility() {
    $("hostLobbyControls").style.display = isHost ? "" : "none";
    $("hostLobbyStartRow").style.display = isHost ? "flex" : "none";
    $("hostGameControls").style.display = isHost ? "" : "none";
}

// ---------- Actions manager UI ----------
function renderActionsManager(roomData) {
    const all = getAllActions(roomData);
    const disabled = getDisabledMap(roomData);
    const noRepeat = !!roomData.settings?.noRepeat;

    const html = all.map(a => {
        const checked = !disabled[a];
        const tag = DEFAULT_ACTIONS.includes(a) ? "base" : "custom";
        return `
      <label class="actionItem">
        <input type="checkbox" data-action="${escapeHtml(a)}" ${checked ? "checked" : ""}/>
        <span>${escapeHtml(a)}</span>
        <span class="mutedTag">${tag}${noRepeat ? " · auto-off" : ""}</span>
      </label>
    `;
    }).join("");

    const box1 = $("actionsBox");
    if (box1) box1.innerHTML = html;

    const box2 = $("g_actionsBox");
    if (box2) box2.innerHTML = html;

    function wire(boxEl) {
        if (!boxEl) return;
        boxEl.onclick = async (ev) => {
            if (!isHost) return;
            const t = ev.target;
            if (!(t instanceof HTMLInputElement)) return;
            if (t.type !== "checkbox") return;

            clickSound();
            const action = t.getAttribute("data-action");
            if (!action) return;

            const enabled = t.checked;
            if (enabled) {
                await set(roomRef(`actions/disabled/${action}`), null);
            } else {
                await set(roomRef(`actions/disabled/${action}`), true);
            }
        };
    }

    wire(box1);
    wire(box2);
}

async function setAllActionsEnabled(roomData, enabled) {
    if (!isHost) return;
    clickSound();
    const all = getAllActions(roomData);
    const updates = {};
    for (const a of all) {
        updates[`actions/disabled/${a}`] = enabled ? null : true;
    }
    await update(roomRef(), updates);
}

// ---------- UI render ----------
function renderLobby(roomData) {
    $("roomCodeText").textContent = nowRoom();

    const players = roomData.players || {};
    const entries = Object.entries(players)
        .filter(([, p]) => p?.inRoom) // <-- IMPORTANT: ya no filtramos por connected
        .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0));

    $("playersList").innerHTML = entries.map(([pid, p]) => {
        const you = pid === playerId ? ` <span class="badge ok">tú</span>` : "";
        const host = roomData.hostPlayerId === pid ? ` <span class="badge">host</span>` : "";
        const online = isOnlinePlayer(p) && p?.online !== false;
        const off = online ? "" : ` <span class="badge offline">offline</span>`;
        const kick = (isHost && pid !== roomData.hostPlayerId)
            ? ` <button class="kickBtn" data-kick="${escapeHtml(pid)}" title="Eliminar jugador">🗑️</button>`
            : "";
        return `<li>
      <span>${escapeHtml(p.name || "—")}${you}${host}${off}</span>
      <span>${kick}</span>
    </li>`;
    }).join("");

    const noRepeat = !!roomData.settings?.noRepeat;
    const useWildcard = !!roomData.settings?.useWildcard;
    const lockJoin = roomData.settings?.lockJoin !== false;
    const punishment = roomData.settings?.punishment || "";

    if ($("chkNoRepeat")) $("chkNoRepeat").checked = noRepeat;
    if ($("chkUseWildcard")) $("chkUseWildcard").checked = useWildcard;
    if ($("chkLockJoin")) $("chkLockJoin").checked = lockJoin;
    if ($("punishmentInput")) $("punishmentInput").value = punishment;

    const custom = (roomData.actions?.custom || []).filter(Boolean);
    $("customActionsList").innerHTML = custom.length
        ? custom.map(a => `<li>${escapeHtml(a)}</li>`).join("")
        : `<li class="muted">Aún no hay acciones personalizadas.</li>`;

    $("hostHint").textContent = isHost
        ? "Eres el host: puedes empezar la partida, cambiar ajustes y eliminar jugadores."
        : "Esperando a que el host empiece.";

    renderHostVisibility();
    renderActionCounts(roomData);
    if (isHost) renderActionsManager(roomData);
}

function renderGame(roomData) {
    $("roomCodeText2").textContent = nowRoom();

    const players = roomData.players || {};
    const assignments = roomData.game?.assignments || {};

    const useWildcard = !!roomData.settings?.useWildcard;
    const wildcardId = roomData.game?.wildcardPlayerId || null;

    // wildcard pill: si NO hay comodín => oculto y centro tarjeta
    if (!useWildcard) {
        $("wildcardPill").style.display = "none";
        $("gameTopGrid").classList.add("centerYou");
    } else {
        $("wildcardPill").style.display = "flex";
        $("gameTopGrid").classList.remove("centerYou");

        const wildcardName = (wildcardId && players[wildcardId]?.name)
            ? players[wildcardId].name
            : "—";
        $("wildcardPill").textContent = `🎁 Comodín: ${wildcardName}`;
    }

    $("youName").textContent = playerName || "—";
    const myAssign = assignments[playerId];
    const myAction = myAssign?.action || "—";
    const iAmWildcard = !!myAssign?.isWildcard;

    $("youRole").textContent = iAmWildcard ? `🎁 (Comodín) · ${myAction}` : myAction;

    const done = !!myAssign?.executed;
    const btn = $("youExecBtn");
    btn.classList.toggle("done", done);
    btn.textContent = done ? "✅ Hecha (pulsa para desmarcar)" : "✅ Marcar como hecha";

    $("youExecHint").textContent = useWildcard
        ? (iAmWildcard
            ? "Eres el comodín, pero también debes cumplir tu acción. Cuando todos marquen hecho, empieza una nueva ronda."
            : "Marca cuando hayas hecho tu acción.")
        : "Cuando todos marquen hecho, cambian las acciones de todos.";

    // MOSTRAR TODOS los inRoom (online u offline), para que no “desaparezcan”
    const inRoomIds = Object.keys(players).filter(pid => players[pid]?.inRoom);
    const rows = inRoomIds
        .sort((a, b) => (players[a]?.name || "").localeCompare(players[b]?.name || "", "es"))
        .map(pid => {
            const p = players[pid];
            const name = p?.name || "—";
            const a = assignments[pid]?.action || "—";
            const exec = !!assignments[pid]?.executed;
            const isW = !!assignments[pid]?.isWildcard;

            const online = isOnlinePlayer(p) && p?.online !== false;
            const off = online ? "" : ` <span class="badge offline">offline</span>`;

            const badge = isW
                ? `<span class="badge">🎁</span> ${exec ? `<span class="badge ok">sí</span>` : `<span class="badge no">no</span>`}`
                : (exec ? `<span class="badge ok">sí</span>` : `<span class="badge no">no</span>`);

            return `<tr>
        <td>${escapeHtml(name)}${pid === playerId ? ' <span class="badge ok">tú</span>' : ''}${off}</td>
        <td>${escapeHtml(a)}</td>
        <td>${badge}</td>
      </tr>`;
        });

    $("assignmentsBody").innerHTML = rows.join("");

    const round = roomData.game?.round || 0;
    const noRepeat = !!roomData.settings?.noRepeat;
    const lockJoin = !!roomData.settings?.lockJoin;
    const punishment = roomData.settings?.punishment || "";

    $("roundInfo").textContent =
        `Ronda: ${round} · Sin repetición: ${noRepeat ? "sí" : "no"} · Comodín: ${useWildcard ? "sí" : "no"} · Sala cerrada: ${lockJoin ? "sí" : "no"} · Host: ${players[roomData.hostPlayerId]?.name || "—"}`;

    $("punishmentInfo").textContent = punishment ? `Castigo si alguien no cumple: ${punishment}` : "";

    // reflejar ajustes en UI de juego
    if ($("g_chkNoRepeat")) $("g_chkNoRepeat").checked = noRepeat;
    if ($("g_chkUseWildcard")) $("g_chkUseWildcard").checked = useWildcard;
    if ($("g_chkLockJoin")) $("g_chkLockJoin").checked = lockJoin;
    if ($("g_punishmentInput")) $("g_punishmentInput").value = punishment;

    renderHostVisibility();
    renderActionCounts(roomData);
    if (isHost) renderActionsManager(roomData);

    if (roomData.game?.outOfActions) openNoActionsOverlay(isHost);
    else closeNoActionsOverlay();
}

// ---------- Listeners ----------
function subscribeRoom() {
    if (roomUnsub) roomUnsub();
    const r = roomRef();

    const off = onValue(r, async (snap) => {
        if (!snap.exists()) {
            goLanding();
            return;
        }

        const data = snap.val();
        isHost = (data.hostPlayerId === playerId);

        if (data.phase === "lobby") {
            goLobby();
            renderLobby(data);
        } else {
            goGame();
            renderGame(data);
            await nextRound(data);
        }

        // música: si el usuario la dejó ON, intentamos (si está desbloqueado por gesto)
        if (isMusicEnabled()) tryPlayMusic();
    });

    roomUnsub = () => off;
}

// ---------- Clipboard copy ----------
async function copyRoomCode() {
    if (!roomCode) return;
    clickSound();
    try {
        await navigator.clipboard.writeText(roomCode);
        successSound();
    } catch {
        const ta = document.createElement("textarea");
        ta.value = roomCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        successSound();
    }
}

// ---------- UI events ----------
$("btnCreate").addEventListener("click", async () => {
    clickSound();
    const name = $("nameInput").value.trim();
    if (!name) return alert("Pon tu nombre.");
    playerName = name;

    await createRoom();
    const snap = await get(roomRef());
    await enterRoomFlow(snap.val());
});

$("btnJoin").addEventListener("click", async () => {
    clickSound();
    const name = $("nameInput").value.trim();
    const code = $("roomInput").value.trim();
    if (!name) return alert("Pon tu nombre.");
    if (!code) return alert("Pon el código de sala.");

    playerName = name;
    const data = await joinRoom(code);
    if (!data) return;
    await enterRoomFlow(data);
});

$("btnLeaveLobby").addEventListener("click", leaveRoomAndMaybeDestroy);
$("btnLeaveGame").addEventListener("click", leaveRoomAndMaybeDestroy);

// copy buttons
$("btnCopyRoom").addEventListener("click", copyRoomCode);
$("btnCopyRoom2").addEventListener("click", copyRoomCode);

// Lobby: host kick button (event delegation)
$("playersList").addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const pid = t.getAttribute("data-kick");
    if (!pid) return;
    if (!isHost) return;
    const ok = confirm("¿Eliminar a este jugador de la sala?");
    if (!ok) return;
    await hostRemovePlayer(pid);
});

// --- Lobby settings (SOLO HOST) ---
$("chkNoRepeat").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/noRepeat"), !!e.target.checked);
});
$("chkUseWildcard").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/useWildcard"), !!e.target.checked);
});
$("chkLockJoin").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/lockJoin"), !!e.target.checked);
});
$("punishmentInput").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/punishment"), String(e.target.value || "").trim());
});

$("btnAddAction").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    clickSound();
    const txt = $("newActionInput").value.trim();
    if (!txt) return;

    const snap = await get(roomRef("actions/custom"));
    const arr = (snap.val() || []).filter(Boolean);
    if (arr.includes(txt) || DEFAULT_ACTIONS.includes(txt)) {
        $("newActionInput").value = "";
        return;
    }
    arr.push(txt);
    await set(roomRef("actions/custom"), arr);
    await set(roomRef(`actions/disabled/${txt}`), null);
    $("newActionInput").value = "";
});

// Start game
$("btnStart").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    clickSound();
    const snap = await get(roomRef());
    const data = snap.val();
    await startGame(data);
});

// --- Botones marcar/desmarcar todas (lobby) ---
$("btnEnableAll").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    const snap = await get(roomRef());
    await setAllActionsEnabled(snap.val(), true);
});
$("btnDisableAll").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    const snap = await get(roomRef());
    await setAllActionsEnabled(snap.val(), false);
});

// --- Game settings (SOLO HOST) ---
$("g_chkNoRepeat").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/noRepeat"), !!e.target.checked);
});
$("g_chkUseWildcard").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/useWildcard"), !!e.target.checked);
});
$("g_chkLockJoin").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/lockJoin"), !!e.target.checked);
});
$("g_punishmentInput").addEventListener("change", async (e) => {
    if (!roomCode || !isHost) return;
    clickSound();
    await set(roomRef("settings/punishment"), String(e.target.value || "").trim());
});
$("g_btnAddAction").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    clickSound();
    const txt = $("g_newActionInput").value.trim();
    if (!txt) return;

    const snap = await get(roomRef("actions/custom"));
    const arr = (snap.val() || []).filter(Boolean);
    if (arr.includes(txt) || DEFAULT_ACTIONS.includes(txt)) {
        $("g_newActionInput").value = "";
        return;
    }
    arr.push(txt);
    await set(roomRef("actions/custom"), arr);
    await set(roomRef(`actions/disabled/${txt}`), null);
    $("g_newActionInput").value = "";
});

// --- Botones marcar/desmarcar todas (game) ---
$("g_btnEnableAll").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    const snap = await get(roomRef());
    await setAllActionsEnabled(snap.val(), true);
});
$("g_btnDisableAll").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    const snap = await get(roomRef());
    await setAllActionsEnabled(snap.val(), false);
});

// NUEVO: Botón grande “Hecha”
$("youExecBtn").addEventListener("click", async () => {
    if (!roomCode || !playerId) return;
    clickSound();
    const snap = await get(roomRef(`game/assignments/${playerId}/executed`));
    const cur = !!snap.val();
    await set(roomRef(`game/assignments/${playerId}/executed`), !cur);
    (!cur ? successSound() : beep(440, 35, "triangle", 0.03));
});

// Overlay buttons
$("btnOverlayEnableAll").addEventListener("click", async () => {
    if (!roomCode || !isHost) return;
    const snap = await get(roomRef());
    await setAllActionsEnabled(snap.val(), true);
    // al reactivar, quitamos outOfActions para reintentar
    await set(roomRef("game/outOfActions"), false);
    closeNoActionsOverlay();
});

$("btnExitNoActions").addEventListener("click", leaveRoomAndMaybeDestroy);
$("btnExitNoActions2").addEventListener("click", leaveRoomAndMaybeDestroy);

// best-effort on close: NO es salir real, solo offline
window.addEventListener("beforeunload", () => {
    try {
        if (roomCode && playerId) {
            update(roomRef(`players/${playerId}`), { connected: false });
        }
    } catch { /* ignore */ }
});

// ---------- Start ----------
goLanding();
