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

    hide("screen-lobby");
    hide("screen-game");
    show("screen-landing");
}
function goLobby() {
    hide("screen-landing");
    hide("screen-game");
    show("screen-lobby");
}
function goGame() {
    hide("screen-landing");
    hide("screen-lobby");
    show("screen-game");
}

// ---------- Presence ----------
async function addPlayerToRoom() {
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

// ---------- Room create/join ----------
async function createRoom() {
    roomCode = makeRoomCode();
    const r = roomRef();

    const initial = {
        createdAt: serverTimestamp(),
        phase: "lobby",
        hostPlayerId: null,
        settings: { noRepeat: true },
        actions: { baseCount: DEFAULT_ACTIONS.length, custom: [] },
        game: {
            round: 0,
            wildcardPlayerId: null,
            usedActions: {},
            assignments: {},
            lastRotationAt: null
        }
    };

    await set(r, initial);
}

async function joinRoom(code) {
    roomCode = code.toUpperCase().trim();
    const snap = await get(roomRef());
    if (!snap.exists()) {
        alert("Esa sala no existe.");
        roomCode = null;
        return false;
    }
    return true;
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

// ---------- Actions pool ----------
function buildActionsPool(roomData) {
    const custom = (roomData.actions?.custom || []).filter(Boolean);
    return [...DEFAULT_ACTIONS, ...custom];
}
function actionAlreadyUsed(roomData, action) {
    return !!roomData.game?.usedActions?.[action];
}
function markUsed(roomUpdates, action) {
    roomUpdates[`game/usedActions/${action}`] = true;
}

// ---------- Game logic ----------
function computeAllExecuted(roomData) {
    const assignments = roomData.game?.assignments || {};
    const wildcardId = roomData.game?.wildcardPlayerId;
    const pids = Object.keys(roomData.players || {}).filter(pid => roomData.players[pid]?.connected);

    const nonWildcard = pids.filter(pid => pid !== wildcardId);
    if (nonWildcard.length === 0) return false;

    for (const pid of nonWildcard) {
        const a = assignments[pid];
        if (!a || !a.action) return false;
        if (!a.executed) return false;
    }
    return true;
}

async function startGame(roomData) {
    if (!isHost) return;

    const players = roomData.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    if (connectedIds.length < 2) {
        alert("Mínimo 2 jugadores para empezar.");
        return;
    }

    const wildcardPlayerId = pickRandom(connectedIds);
    const noRepeat = !!roomData.settings?.noRepeat;

    const pool = buildActionsPool(roomData);
    const shuffledPlayers = shuffle(connectedIds.filter(pid => pid !== wildcardPlayerId));

    const updates = {};
    updates["phase"] = "game";
    updates["game/round"] = 1;
    updates["game/wildcardPlayerId"] = wildcardPlayerId;
    updates["game/lastRotationAt"] = serverTimestamp();
    updates["game/assignments"] = {};
    updates["game/usedActions"] = roomData.game?.usedActions || {};

    for (const pid of shuffledPlayers) {
        let action = null;

        if (noRepeat) {
            const unused = pool.filter(a => !actionAlreadyUsed(roomData, a) && !updates[`game/usedActions/${a}`]);
            action = unused.length ? pickRandom(unused) : pickRandom(pool);
        } else {
            action = pickRandom(pool);
        }

        updates[`game/assignments/${pid}`] = { action, executed: false };
        if (noRepeat) markUsed(updates, action);
    }

    updates[`game/assignments/${wildcardPlayerId}`] = { action: "COMODÍN", executed: true };
    await update(roomRef(), updates);
}

async function rotateWildcardIfNeeded(roomData) {
    if (!isHost) return;
    if (!computeAllExecuted(roomData)) return;

    const players = roomData.players || {};
    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    if (connectedIds.length < 2) return;

    const oldWildcard = roomData.game?.wildcardPlayerId;
    const candidates = connectedIds.filter(pid => pid !== oldWildcard);
    if (!candidates.length) return;

    const newWildcard = pickRandom(candidates);
    const pool = buildActionsPool(roomData);
    const noRepeat = !!roomData.settings?.noRepeat;

    const updates = {};
    updates["game/round"] = (roomData.game?.round || 0) + 1;
    updates["game/wildcardPlayerId"] = newWildcard;
    updates["game/lastRotationAt"] = serverTimestamp();

    let newAction = null;
    if (noRepeat) {
        const used = roomData.game?.usedActions || {};
        const unused = pool.filter(a => !used[a]);
        newAction = unused.length ? pickRandom(unused) : pickRandom(pool);
        updates[`game/usedActions/${newAction}`] = true;
    } else {
        newAction = pickRandom(pool);
    }

    const currentAssignments = roomData.game?.assignments || {};
    for (const pid of connectedIds) {
        if (pid === newWildcard) {
            updates[`game/assignments/${pid}`] = { action: "COMODÍN", executed: true };
        } else if (pid === oldWildcard) {
            updates[`game/assignments/${pid}`] = { action: newAction, executed: false };
        } else {
            const prev = currentAssignments[pid];
            const action = prev?.action || pickRandom(pool);
            updates[`game/assignments/${pid}`] = { action, executed: false };
        }
    }

    await update(roomRef(), updates);
}

// ---------- UI render ----------
function renderLobby(roomData) {
    $("roomCodeText").textContent = nowRoom();
    $("roomCodeText2").textContent = nowRoom();

    const players = roomData.players || {};
    const entries = Object.entries(players)
        .filter(([, p]) => p?.connected)
        .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0));

    $("playersList").innerHTML = entries.map(([pid, p]) => {
        const you = pid === playerId ? ` <span class="badge ok">tú</span>` : "";
        const host = roomData.hostPlayerId === pid ? ` <span class="badge">host</span>` : "";
        return `<li>${escapeHtml(p.name || "—")}${you}${host}</li>`;
    }).join("");

    $("chkNoRepeat").checked = !!roomData.settings?.noRepeat;

    const custom = (roomData.actions?.custom || []).filter(Boolean);
    $("customActionsList").innerHTML = custom.length
        ? custom.map(a => `<li>${escapeHtml(a)}</li>`).join("")
        : `<li class="muted">Aún no hay acciones personalizadas.</li>`;

    $("hostHint").textContent = isHost
        ? "Eres el host: puedes empezar la partida."
        : "Esperando a que el host empiece.";

    $("btnStart").disabled = !isHost;
}

function renderGame(roomData) {
    $("roomCodeText2").textContent = nowRoom();

    const players = roomData.players || {};
    const assignments = roomData.game?.assignments || {};
    const wildcardId = roomData.game?.wildcardPlayerId;

    const wildcardName = wildcardId && players[wildcardId]?.name ? players[wildcardId].name : "—";
    $("wildcardPill").textContent = `Comodín: ${wildcardName}`;

    $("youName").textContent = playerName || "—";

    const myAssign = assignments[playerId];
    const myAction = myAssign?.action || "—";
    $("youRole").textContent = (playerId === wildcardId) ? "COMODÍN ✅" : myAction;

    const isWildcard = playerId === wildcardId;
    $("youExecWrap").style.display = isWildcard ? "none" : "flex";
    $("youExecHint").textContent = isWildcard
        ? "Eres el comodín. Cuando todos ejecuten su acción, tu acción cambiará y el comodín pasará a otra persona."
        : "Marca cuando hayas hecho tu acción.";

    if (!isWildcard) $("youExecChk").checked = !!myAssign?.executed;

    const connectedIds = Object.keys(players).filter(pid => players[pid]?.connected);
    const rows = connectedIds
        .sort((a, b) => (players[a]?.name || "").localeCompare(players[b]?.name || "", "es"))
        .map(pid => {
            const name = players[pid]?.name || "—";
            const a = assignments[pid]?.action || "—";
            const exec = !!assignments[pid]?.executed;
            const isW = pid === wildcardId;
            const badge = isW
                ? `<span class="badge">COMODÍN</span>`
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
    $("roundInfo").textContent = `Ronda: ${round} · Acciones sin repetición: ${noRepeat ? "sí" : "no"} · Host: ${players[roomData.hostPlayerId]?.name || "—"}`;
}

// ---------- Listeners ----------
function subscribeRoom() {
    if (roomUnsub) roomUnsub();

    const off = onValue(roomRef(), async (snap) => {
        if (!snap.exists()) {
            alert("La sala ha sido borrada o no existe.");
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
            await rotateWildcardIfNeeded(data);
        }
    });

    roomUnsub = off; // ✅ FIX
}

// ---------- UI events ----------
$("btnCreate").addEventListener("click", async () => {
    const name = $("nameInput").value.trim();
    if (!name) return alert("Pon tu nombre.");

    playerName = name;

    await createRoom();
    await addPlayerToRoom();
    await ensureHost();

    $("roomCodeText").textContent = nowRoom();
    $("roomCodeText2").textContent = nowRoom();
    subscribeRoom();
});

$("btnJoin").addEventListener("click", async () => {
    const name = $("nameInput").value.trim();
    const code = $("roomInput").value.trim();

    if (!name) return alert("Pon tu nombre.");
    if (!code) return alert("Pon el código de sala.");

    playerName = name;

    const ok = await joinRoom(code);
    if (!ok) return;

    await addPlayerToRoom();
    await ensureHost();
    subscribeRoom();
});

$("btnLeaveLobby").addEventListener("click", async () => {
    if (roomCode && playerId) {
        await update(roomRef(`players/${playerId}`), { connected: false, leftAt: serverTimestamp() });
    }
    goLanding();
});

$("btnLeaveGame").addEventListener("click", async () => {
    if (roomCode && playerId) {
        await update(roomRef(`players/${playerId}`), { connected: false, leftAt: serverTimestamp() });
    }
    goLanding();
});

$("chkNoRepeat").addEventListener("change", async (e) => {
    if (!roomCode) return;
    await set(roomRef("settings/noRepeat"), !!e.target.checked);
});

$("btnAddAction").addEventListener("click", async () => {
    if (!roomCode) return;
    const txt = $("newActionInput").value.trim();
    if (!txt) return;

    const snap = await get(roomRef("actions/custom"));
    const arr = (snap.val() || []).filter(Boolean);
    arr.push(txt);
    await set(roomRef("actions/custom"), arr);
    $("newActionInput").value = "";
});

$("btnStart").addEventListener("click", async () => {
    if (!roomCode) return;
    const snap = await get(roomRef());
    await startGame(snap.val());
});

$("youExecChk").addEventListener("change", async (e) => {
    if (!roomCode || !playerId) return;
    const snap = await get(roomRef("game/wildcardPlayerId"));
    const wildcardId = snap.val();
    if (playerId === wildcardId) return;

    await set(roomRef(`game/assignments/${playerId}/executed`), !!e.target.checked);
});

// ---------- Start ----------
goLanding();
