import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// =====================================
// NEO SHOOTER 3D - ADMIN GAME
// =====================================

const $ = id => document.getElementById(id);

const gameElement = $("game");
const statusElement = $("serverStatus");
const playerInfo = $("playerInfo");

let scene;
let camera;
let renderer;
let player;
let socket;
let animationFrame;
let lastUpdate = 0;
let gameStarted = false;

const otherPlayers = new Map();

const admin = {
    enabled: false,
    invisible: false,
    godMode: false,
    fly: false,
    speed: 8
};

const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
};

const playerName =
    localStorage.getItem("neoUsername") || "Administrator";

const playerColor =
    localStorage.getItem("neoColor") || "#00ddff";

// =====================================
// STATUS
// =====================================

function setStatus(message) {
    if (statusElement) statusElement.textContent = message;
}

function checkAdmin() {
    admin.enabled =
        window.NEO_ADMIN_MODE === true &&
        !!(
            window.NEO_ADMIN_TOKEN ||
            sessionStorage.getItem("neoAdminToken")
        );

    return admin.enabled;
}

// =====================================
// START GAME
// =====================================

window.startNeoGame = function () {
    if (gameStarted) return;

    if (!gameElement) {
        setStatus("Nerastas žaidimo langas");
        return;
    }

    if (!checkAdmin()) {
        setStatus("Reikia administratoriaus prisijungimo");
        return;
    }

    gameStarted = true;

    createWorld();
    createPlayer();
    createAdminControls();
    createTouchControls();
    setupKeyboard();
    connectServer();

    animate();

    setStatus("3D žaidimas paleistas");
};

// =====================================
// 3D WORLD
// =====================================

function createWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.Fog(0x071426, 45, 160);

    camera = new THREE.PerspectiveCamera(
        70,
        1,
        0.1,
        300
    );

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
    );

    renderer.shadowMap.enabled = true;

    gameElement.innerHTML = "";
    gameElement.appendChild(renderer.domElement);

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const ambient = new THREE.HemisphereLight(
        0xbdeaff,
        0x172033,
        2
    );

    scene.add(ambient);

    const sunlight = new THREE.DirectionalLight(
        0xffffff,
        2
    );

    sunlight.position.set(30, 60, 20);
    sunlight.castShadow = true;
    scene.add(sunlight);

    createGround();
    createCity();

    resizeGame();

    window.addEventListener("resize", resizeGame);

    if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(resizeGame);
        observer.observe(gameElement);
    }
}

function createGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({
            color: 0x172638,
            roughness: 0.9
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(
        180,
        90,
        0x00bddd,
        0x29445b
    );

    grid.position.y = 0;
    scene.add(grid);
}

function createCity() {
    for (let x = -60; x <= 60; x += 20) {
        for (let z = -60; z <= 60; z += 20) {
            if (Math.abs(x) < 15 && Math.abs(z) < 15) {
                continue;
            }

            const height = 8 + Math.random() * 22;

            const building = new THREE.Mesh(
                new THREE.BoxGeometry(10, height, 10),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(
                        0.56 + Math.random() * 0.08,
                        0.4,
                        0.18 + Math.random() * 0.12
                    ),
                    roughness: 0.7
                })
            );

            building.position.set(
                x + (Math.random() - 0.5) * 4,
                height / 2,
                z + (Math.random() - 0.5) * 4
            );

            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);
        }
    }
}

// =====================================
// PLAYER
// =====================================

function makeAvatar(color) {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
        color: color
    });

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1, 4, 8),
        material
    );

    body.position.y = 1;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0xf0c9a5
        })
    );

    head.position.y = 2;
    group.add(head);

    const marker = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.04, 8, 32),
        new THREE.MeshBasicMaterial({
            color: 0x00eaff
        })
    );

    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.05;
    group.add(marker);

    return group;
}

function createPlayer() {
    player = makeAvatar(playerColor);
    player.position.set(0, 0, 0);
    scene.add(player);

    camera.position.set(0, 5, 9);
    camera.lookAt(0, 1, 0);
}

// =====================================
// OTHER PLAYERS
// =====================================

function addOtherPlayer(data) {
    if (!data || !data.id || data.id === socket?.id) return;

    let object = otherPlayers.get(data.id);

    if (!object) {
        object = makeAvatar(data.color || "#ff9900");
        scene.add(object);
        otherPlayers.set(data.id, object);
    }

    updateOtherPlayer(data);
}

function updateOtherPlayer(data) {
    if (!data || !data.id) return;

    if (data.id === socket?.id) {
        if (player && Number.isFinite(data.x)) {
            player.position.set(
                data.x,
                Number(data.y) || 0,
                Number(data.z) || 0
            );
        }
        return;
    }

    let object = otherPlayers.get(data.id);

    if (!object) {
        addOtherPlayer(data);
        return;
    }

    object.position.set(
        Number(data.x) || 0,
        Number(data.y) || 0,
        Number(data.z) || 0
    );

    object.rotation.y = Number(data.rotation) || 0;
    object.visible = data.invisible !== true;
}

function removeOtherPlayer(id) {
    const object = otherPlayers.get(id);

    if (!object) return;

    scene.remove(object);
    otherPlayers.delete(id);
}

// =====================================
// SERVER CONNECTION
// =====================================

function connectServer() {
    if (socket?.connected) return;

    if (typeof window.io !== "function") {
        setStatus("Socket.IO biblioteka nepasiekiama");
        return;
    }

    const token =
        window.NEO_ADMIN_TOKEN ||
        sessionStorage.getItem("neoAdminToken");

    socket = window.io({
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1500,
        timeout: 10000
    });

    socket.on("connect", () => {
        setStatus("Prisijungta prie serverio");
        sendPlayerUpdate();
    });

    socket.on("connect_error", error => {
        setStatus("Prisijungimo klaida: " + error.message);
    });

    socket.on("disconnect", () => {
        setStatus("Ryšys nutrūko. Bandoma prisijungti...");
    });

    socket.on("playersUpdate", list => {
        if (!Array.isArray(list)) return;

        const seen = new Set();

        list.forEach(data => {
            if (!data.id || data.id === socket.id) return;
            seen.add(data.id);
            addOtherPlayer(data);
        });

        for (const id of otherPlayers.keys()) {
            if (!seen.has(id)) removeOtherPlayer(id);
        }

        if (playerInfo) {
            playerInfo.textContent =
                "Žaidėjų serveryje: " + list.length;
        }
    });

    socket.on("playerJoined", data => {
        addOtherPlayer(data);
    });

    socket.on("playerMoved", data => {
        updateOtherPlayer(data);
    });

    socket.on("playerLeft", data => {
        removeOtherPlayer(
            typeof data === "string" ? data : data.id
        );
    });

    socket.on("adminMessage", message => {
        showAnnouncement(message);
    });

    socket.on("serverNotice", message => {
        showAnnouncement(message);
    });

    socket.on("banned", () => {
        setStatus("Prieiga prie serverio užblokuota");
        socket.disconnect();
    });
}

// =====================================
// SEND PLAYER UPDATE
// =====================================

function sendPlayerUpdate() {
    if (!socket?.connected || !player) return;

    socket.emit("playerMove", {
        username: playerName,
        color: playerColor,
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotation: player.rotation.y,
        invisible: admin.invisible,
        godMode: admin.godMode,
        flying: admin.fly,
        speed: admin.speed
    });
}

// =====================================
// ADMIN CONTROLS
// =====================================

function createAdminControls() {
    const panel = document.createElement("div");
    panel.id = "neoAdminGamePanel";

    panel.innerHTML = `
        <div class="neo-admin-title">
            ADMIN CONTROL
            <button id="neoAdminToggle">−</button>
        </div>

        <div id="neoAdminControls">
            <label>
                <input type="checkbox" id="adminInvisible">
                Invisible
            </label>

            <label>
                <input type="checkbox" id="adminGod">
                God Mode
            </label>

            <label>
                <input type="checkbox" id="adminFly">
                Fly Mode
            </label>

            <div class="neo-admin-field">
                <span>Speed: <b id="adminSpeedValue">8</b></span>
                <input type="range" id="adminSpeed"
                    min="4" max="30" value="8">
            </div>

            <button id="adminTeleport">TELEPORT TO CENTER</button>
            <button id="adminReset">RESET POWERS</button>

            <p id="adminPowerStatus">Admin powers ready</p>
        </div>
    `;

    const style = document.createElement("style");

    style.textContent = `
        #neoAdminGamePanel {
            position:absolute;
            top:10px;
            right:10px;
            z-index:20;
            width:190px;
            max-width:48%;
            box-sizing:border-box;
            padding:10px;
            color:white;
            background:rgba(5,13,27,.94);
            border:1px solid #00dfff;
            border-radius:12px;
            font:13px Arial,sans-serif;
        }

        .neo-admin-title {
            color:#00eaff;
            font-weight:bold;
            display:flex;
            justify-content:space-between;
            align-items:center;
        }

        #neoAdminGamePanel label {
            display:flex;
            align-items:center;
            gap:8px;
            padding:7px 0;
        }

        #neoAdminGamePanel input[type=checkbox] {
            width:18px;
            height:18px;
            accent-color:#00dfff;
        }

        .neo-admin-field {
            margin-top:10px;
        }

        .neo-admin-field input {
            width:100%;
        }

        #neoAdminGamePanel button {
            padding:9px;
            margin-top:7px;
            width:100%;
            border:0;
            border-radius:6px;
            background:#00cce8;
            color:#001018;
            font-weight:bold;
        }

        #neoAdminToggle {
            width:30px!important;
            margin:0!important;
        }

        #adminPowerStatus {
            color:#55eaff;
            font-size:11px;
        }

        #touchControls {
            position:absolute;
            bottom:10px;
            left:10px;
            z-index:15;
        }

        .neo-pad {
            display:grid;
            grid-template-columns:repeat(3,48px);
            gap:4px;
        }

        .neo-pad button {
            width:48px;
            height:45px;
            border:1px solid #00dfff;
            border-radius:9px;
            background:rgba(0,30,50,.85);
            color:white;
            font-size:18px;
            touch-action:none;
        }
    `;

    document.head.appendChild(style);
    gameElement.appendChild(panel);

    $("neoAdminToggle").onclick = () => {
        const controls = $("neoAdminControls");
        controls.hidden = !controls.hidden;
        $("neoAdminToggle").textContent =
            controls.hidden ? "+" : "−";
    };

    $("adminInvisible").onchange = event => {
        admin.invisible = event.target.checked;
        sendPlayerUpdate();
        updateAdminStatus("Invisible pakeistas");
    };

    $("adminGod").onchange = event => {
        admin.godMode = event.target.checked;
        sendPlayerUpdate();
        updateAdminStatus("God Mode pakeistas");
    };

    $("adminFly").onchange = event => {
        admin.fly = event.target.checked;
        sendPlayerUpdate();
        updateAdminStatus("Fly Mode pakeistas");
    };

    $("adminSpeed").oninput = event => {
        admin.speed = Number(event.target.value);
        $("adminSpeedValue").textContent = admin.speed;
        sendPlayerUpdate();
    };

    $("adminTeleport").onclick = () => {
        if (!player) return;

        player.position.set(0, 0, 0);
        sendPlayerUpdate();
        updateAdminStatus("Teleport atliktas");
    };

    $("adminReset").onclick = resetAdminPowers;
}

function updateAdminStatus(message) {
    const status = $("adminPowerStatus");
    if (status) status.textContent = message;
}

function resetAdminPowers() {
    admin.invisible = false;
    admin.godMode = false;
    admin.fly = false;
    admin.speed = 8;

    $("adminInvisible").checked = false;
    $("adminGod").checked = false;
    $("adminFly").checked = false;
    $("adminSpeed").value = 8;
    $("adminSpeedValue").textContent = "8";

    sendPlayerUpdate();
    updateAdminStatus("All powers reset");
}

// =====================================
// MOVEMENT
// =====================================

function movePlayer(delta) {
    if (!player) return;

    const direction = new THREE.Vector3();

    if (keys.forward) direction.z -= 1;
    if (keys.backward) direction.z += 1;
    if (keys.left) direction.x -= 1;
    if (keys.right) direction.x += 1;

    if (admin.fly) {
        if (keys.up) direction.y += 1;
        if (keys.down) direction.y -= 1;
    }

    if (direction.lengthSq() === 0) return;

    direction.normalize();

    const speed = admin.enabled ? admin.speed : 8;

    player.position.x += direction.x * speed * delta;
    player.position.z += direction.z * speed * delta;

    if (admin.fly) {
        player.position.y += direction.y * speed * delta;
        player.position.y = THREE.MathUtils.clamp(
            player.position.y, 0, 80
        );
    } else {
        player.position.y = 0;
    }

    player.position.x = THREE.MathUtils.clamp(
        player.position.x, -75, 75
    );

    player.position.z = THREE.MathUtils.clamp(
        player.position.z, -75, 75
    );

    player.rotation.y = Math.atan2(
        direction.x,
        -direction.z
    );
}

// =====================================
// KEYBOARD
// =====================================

function setupKeyboard() {
    window.addEventListener("keydown", event => {
        const key = event.key.toLowerCase();

        if ([
            "w", "a", "s", "d",
            "arrowup", "arrowdown",
            "arrowleft", "arrowright",
            " ", "shift"
        ].includes(key)) {
            event.preventDefault();
        }

        if (key === "w" || key === "arrowup") keys.forward = true;
        if (key === "s" || key === "arrowdown") keys.backward = true;
        if (key === "a" || key === "arrowleft") keys.left = true;
        if (key === "d" || key === "arrowright") keys.right = true;
        if (key === " ") keys.up = true;
        if (key === "shift") keys.down = true;
    });

    window.addEventListener("keyup", event => {
        const key = event.key.toLowerCase();

        if (key === "w" || key === "arrowup") keys.forward = false;
        if (key === "s" || key === "arrowdown") keys.backward = false;
        if (key === "a" || key === "arrowleft") keys.left = false;
        if (key === "d" || key === "arrowright") keys.right = false;
        if (key === " ") keys.up = false;
        if (key === "shift") keys.down = false;
    });

    window.addEventListener("blur", () => {
        Object.keys(keys).forEach(key => {
            keys[key] = false;
        });
    });
}

// =====================================
// MOBILE CONTROLS
// =====================================

function createTouchControls() {
    const controls = document.createElement("div");
    controls.id = "touchControls";

    controls.innerHTML = `
        <div class="neo-pad">
            <span></span>
            <button data-key="forward">▲</button>
            <span></span>
            <button data-key="left">◀</button>
            <button data-key="backward">▼</button>
            <button data-key="right">▶</button>
            <button data-key="down">−</button>
            <button data-key="up">+</button>
        </div>
    `;

    gameElement.appendChild(controls);

    controls.querySelectorAll("[data-key]").forEach(button => {
        const key = button.dataset.key;

        const start = event => {
            event.preventDefault();
            keys[key] = true;
        };

        const stop = event => {
            event.preventDefault();
            keys[key] = false;
        };

        button.addEventListener("pointerdown", start);
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("pointerleave", stop);
    });
}

// =====================================
// CAMERA AND RENDER
// =====================================

function resizeGame() {
    if (!renderer || !camera || !gameElement) return;

    const width = Math.max(1, gameElement.clientWidth);
    const height = Math.max(1, gameElement.clientHeight);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
}

function animate(time = 0) {
    animationFrame = requestAnimationFrame(animate);

    if (!renderer || !scene || !camera || !player) return;

    const delta = Math.min(
        (time - (animate.lastTime || time)) / 1000,
        0.05
    );

    animate.lastTime = time;

    movePlayer(delta);

    const cameraTarget = new THREE.Vector3(
        player.position.x,
        player.position.y + 5,
        player.position.z + 8
    );

    camera.position.lerp(cameraTarget, 0.12);

    camera.lookAt(
        player.position.x,
        player.position.y + 1,
        player.position.z
    );

    if (time - lastUpdate > 120) {
        sendPlayerUpdate();
        lastUpdate = time;
    }

    renderer.render(scene, camera);
}

// =====================================
// ANNOUNCEMENT
// =====================================

function showAnnouncement(message) {
    const element = $("adminAnnouncement");

    i