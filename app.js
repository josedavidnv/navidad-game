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
    // SOLO: host -> botones host; user -> botones user
    $("overlayBtnsHost").style.display = isHostNow ? "flex" : "none";
    $("overlayBtnsUser").style.display = isHostNow ? "none" : "flex";
}

function closeNoActionsOverlay() {
    hide("overlayNoActions");
}

// ---------- Local UX prefs (snow/sound/theme) ----------
const LS = {
    snow: "xmas_snow_enabled",
    sound: "xmas_sound_enabled",
    theme: "xmas_theme" // "dark" | "light"
};

function getBoolLS(key, fallback = true) {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1";
}
function setBoolLS(key, val) {
    localStorage.setItem(key, val ? "1" : "0");
}
function getThemeLS() {
    return localStorage.getItem(LS.theme) || "dark";
}
function setThemeLS(v) {
    localStorage.setItem(LS.theme, v);
}

// ---------- Tiny sounds (WebAudio, no files) ----------
let audioCtx = null;
function canSound() {
    return getBoolLS(LS.sound, true);
}
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

// ---------- Corner panel ----------
(function initCornerPanel() {
    const btn = $("cornerToggleBtn");
    const panel = $("cornerPanel");

    const snowOn = getBoolLS(LS.snow, true);
    const soundOn = getBoolLS(LS.sound, true);

    $("toggleSnow").textContent = snowOn ? "ON" : "OFF";
    $("toggleSound").textContent = soundOn ? "ON" : "OFF";
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
        vx: -0.15 + Math.random() * 0.3,
        vy: 0.35 + Math.random() * 0.9, // más lento
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

    const dt = Math.min(32, ts - (snowLastT || ts)); // clamp
    snowLastT = ts;

    ensureSnowParticles();
    ctx.clearRect(0, 0, w, h);

    // dibuja
    for (const p of snowParticles) {
        // movimiento suave y lento
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // pequeño “sway” muy leve
        p.x += Math.sin((p.y / 70) + (ts / 1800)) * 0.08;

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

// ---------- Presence fix (MÓVIL / BLOQUEO) ----------
let lastPresenceFixAt = 0;

async function markMeConnected(reason = "") {
    if (!roomCode || !playerId) return;

    // Evita spamear writes si el navegador dispara muchos eventos
    const now = Date.now();
    if (now - lastPresenceFixAt < 3000) return;
    lastPresenceFixAt = now;

    try {
        // 1) me marco como conectado
        await update(roomRef(`players/${playerId}`), {
            connected: true,
            leftAt: null,
            // opcional (útil para debug): lastSeenAt: serverTimestamp(),
        });

        // 2) re-registro onDisconnect (clave en móvil)
        onDisconnect(roomRef(`players/${playerId}`)).update({
            connected: false,
            leftAt: serverTimestamp()
        });
    } catch {
        // ignore
    }
}

// Cuando la app vuelve a primer plano / recupera conexión
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) markMeConnected("visibilitychange");
});
window.addEventListener("focus", () => markMeConnected("focus"));
window.addEventListener("online", () => markMeConnected("online"));

// Heartbeat suave: si el móvil “mata” la conexión y vuelve, lo repara solo
setInterval(() => {
    // solo si estamos dentro de una sala
    if (!roomCode || !playerId) return;
    // si está en background, no fuerces
    if (document.hidden) return;
    markMeConnected("heartbeat");
}, 25000);

// ---------- Player join / rejoin + unique names ----------
function findPlayerIdByName(roomData, name) {
    const players = roomData.players || {};
    const target = normName(name);
    for (const [pid, p] of Object.entries(players)) {
        if (normName(p?.name) === target) return pid;
    }
    return null;
}

function isNameTakenByOtherConnected(roomData, name) {
    const players = roomData.players || {};
    const target = normName(name);
    for (const [pid, p] of Object.entries(players)) {
        if (!p) continue;
        if (normName(p.name) === target && p.connected) return pid;
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
        connected: true
    });

    onDisconnect(newRef).update({ connected: false, leftAt: serverTimestamp() });
}

async function reconnectExistingPlayer(existingPid) {
    playerId = existingPid;
    await update(roomRef(`players/${playerId}`), {
        connected: true,
        leftAt: null
    });
    onDisconnect(roomRef(`players/${playerId}`)).update({ connected: false, leftAt: serverTimestamp() });
}

async function enterRoomFlow(roomData) {
    const takenPid = isNameTakenByOtherConnected(roomData, playerName);
    if (takenPid) {
        alert("Ese nombre ya lo está usando alguien en la sala. Elige otro 🙂");
        return false;
    }

    const existingPid = findPlayerIdByName(roomData, playerName);

    const phase = roomData.phase || "lobby";
    const lockJoin = !!roomData.settings?.lockJoin;
    if (phase === "game" && lockJoin && !existingPid) {
        alert("La partida ya ha empezado y la sala está cerrada. No se pueden unir nuevos jugadores.");
        return false;
    }

    if (existingPid) await reconnectExistingPlayer(existingPid);
    else await addNewPlayerToRoom();

    await ensureHost();
    subscribeRoom();

    // 👇 Importantísimo: al entrar, asegúrate de que el presence queda bien
    await markMeConnected("enterRoomFlow");

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
function computeAllExecuted(roomData) {
    const assignments = roomData.game?.assignments || {};
    const players = roomData.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);

    if (connectedIds.length === 0) return false;

    for (const pid of connectedIds) {
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

    const players = roomData.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    if (connectedIds.length < 2) {
        alert("Mínimo 2 jugadores para empezar.");
        return;
    }

    // VALIDACIÓN: acciones activas >= jugadores
    const poolEnabled = buildEnabledPool(roomData);
    if (poolEnabled.length < connectedIds.length) {
        alert(`No puedes empezar: hay ${connectedIds.length} jugadores y solo ${poolEnabled.length} acciones activas.\nActiva más acciones o añade nuevas.`);
        return;
    }

    const useWildcard = !!roomData.settings?.useWildcard;
    const wildcardPlayerId = useWildcard ? pickRandom(connectedIds) : null;

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
    const order = shuffle([...connectedIds]);

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

    const players = roomData.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    if (connectedIds.length < 1) return;

    const useWildcard = !!roomData.settings?.useWildcard;
    const noRepeat = !!roomData.settings?.noRepeat;
    const usedActions = { ...(roomData.game?.usedActions || {}) };

    const pool = buildEnabledPool(roomData);
    const oldWildcard = roomData.game?.wildcardPlayerId || null;

    let newWildcard = null;
    if (useWildcard) {
        const candidates = connectedIds.filter(pid => pid !== oldWildcard);
        newWildcard = candidates.length ? pickRandom(candidates) : pickRandom(connectedIds);
    }

    const newAssignments = {};
    const order = shuffle([...connectedIds]);

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
    const connectedCount = Object.values(players).filter(p => p?.connected).length;
    if (connectedCount === 0) await set(roomRef(), null);
}

async function leaveRoomAndMaybeDestroy() {
    leavingNow = true;
    clickSound();
    if (roomCode && playerId) {
        try {
            await update(roomRef(`players/${playerId}`), { connected: false, leftAt: serverTimestamp() });
        } catch { /* ignore */ }
        try { await maybeDestroyRoomIfEmpty(); } catch { /* ignore */ }
    }
    goLanding();
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
        .filter(([, p]) => p?.connected)
        .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0));

    $("playersList").innerHTML = entries.map(([pid, p]) => {
        const you = pid === playerId ? ` <span class="badge ok">tú</span>` : "";
        const host = roomData.hostPlayerId === pid ? ` <span class="badge">host</span>` : "";
        return `<li>${escapeHtml(p.name || "—")}${you}${host}</li>`;
    }).join("");

    const noRepeat = !!roomData.settings?.noRepeat;
    const useWildcard = !!roomData.settings?.useWildcard;
    const lockJoin = roomData.settings?.lockJoin !== false;
    const punishment = roomData.settings?.punishment || "";

    if ($("chkNoRepeat")) $("chkNoRepeat").checked = noRepeat;
    if ($("chkUseWildcard")) $("chkUseWildcard").checked = useWildcard; // por defecto false ya en DB
    if ($("chkLockJoin")) $("chkLockJoin").checked = lockJoin;
    if ($("punishmentInput")) $("punishmentInput").value = punishment;

    const custom = (roomData.actions?.custom || []).filter(Boolean);
    $("customActionsList").innerHTML = custom.length
        ? custom.map(a => `<li>${escapeHtml(a)}</li>`).join("")
        : `<li class="muted">Aún no hay acciones personalizadas.</li>`;

    $("hostHint").textContent = isHost
        ? "Eres el host: puedes empezar la partida y cambiar ajustes."
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

    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    const rows = connectedIds
        .sort((a, b) => (players[a]?.name || "").localeCompare(players[b]?.name || "", "es"))
        .map(pid => {
            const name = players[pid]?.name || "—";
            const a = assignments[pid]?.action || "—";
            const exec = !!assignments[pid]?.executed;
            const isW = !!assignments[pid]?.isWildcard;
            const badge = isW
                ? `<span class="badge">🎁</span> ${exec ? `<span class="badge ok">sí</span>` : `<span class="badge no">no</span>`}`
                : (exec ? `<span class="badge ok">sí</span>` : `<span class="badge no">no</span>`);
            return `<tr>
        <td>${escapeHtml(name)}${pid === playerId ? ' <span class="badge ok">tú</span>' : ''}</td>
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
            // NO mostrar alert si yo me voy / sala vacía borrada
            goLanding();
            return;
        }

        const data = snap.val();

        // ✅ AUTO-REPAIR presence: si existo pero me marca desconectado, lo arreglo
        try {
            const me = data.players?.[playerId];
            if (roomCode && playerId && me && me.connected === false && !document.hidden) {
                await markMeConnected("subscribeRoom_autorepair");
            }
        } catch { /* ignore */ }

        isHost = (data.hostPlayerId === playerId);

        if (data.phase === "lobby") {
            goLobby();
            renderLobby(data);
        } else {
            goGame();
            renderGame(data);
            await nextRound(data);
        }
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
        // fallback
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

// best-effort on close
window.addEventListener("beforeunload", () => {
    try {
        if (roomCode && playerId) {
            update(roomRef(`players/${playerId}`), { connected: false, leftAt: serverTimestamp() });
        }
    } catch { /* ignore */ }
});

// ---------- Start ----------
goLanding();
