
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// ==========================================
// NEO SHOOTER 3D - GAME ENGINE
// ==========================================

"use strict";

const $ = id => document.getElementById(id);

const menu = $("menu");
const gameElement = $("game");
const playButton = $("playButton");
const exitButton = $("exitButton");
const playerInfo = $("playerInfo");
const onlinePlayers = $("onlinePlayers");
const announcement = $("adminAnnouncement");
const serverStatus = $("serverStatus");

let scene;
let camera;
let renderer;
let player;
let socket;

let gameRunning = false;
let animationId = null;
let previousTime = 0;
let lastNetworkUpdate = 0;

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

let playerName =
    localStorage.getItem("neoUsername") || "Žaidėjas";

let playerColor =
    localStorage.getItem("neoColor") || "#00eaff";

let equipment = {
    weapon: "neon",
    shield: "blue",
    outfit: "default"
};

try {
    equipment = {
        ...equipment,
        ...JSON.parse(
            localStorage.getItem("neoEquipment") || "{}"
        )
    };
} catch {
    console.warn("Equipment could not be loaded.");
}

const COLORS = {
    weapon: {
        neon: 0x00eaff,
        gold: 0xffcc33,
        ice: 0x77ddff,
        purple: 0xaa55ff,
        red: 0xff4455
    },
    shield: {
        blue: 0x0088ff,
        gold: 0xffcc33,
        green: 0x22dd88,
        purple: 0xaa55ff
    },
    outfit: {
        default: 0x00aacc,
        dark: 0x333344,
        red: 0xdd3344,
        gold: 0xccaa33
    }
};

// ==========================================
// ADMIN AUTHORIZATION
// ==========================================

// Admin mode must be enabled by admin.html
// after successful administrator login.

function checkAdmin() {
    admin.enabled =
        window.NEO_ADMIN_MODE === true &&
        !!sessionStorage.getItem("neoAdminToken");

    return admin.enabled;
}

// ==========================================
// STATUS
// ==========================================

function setServerStatus(message) {
    if (serverStatus) {
        serverStatus.textContent = message;
    }
}

function updateOnlineCount() {
    if (onlinePlayers) {
        onlinePlayers.textContent =
            "Online: " +
            (socket?.connected
                ? otherPlayers.size + 1
                : 0);
    }
}

function cleanName(value) {
    return String(value || "Žaidėjas")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 18) || "Žaidėjas";
}

// ==========================================
// SOCKET.IO
// ==========================================

function connectServer() {
    if (socket?.connected) return;

    if (typeof window.io !== "function") {
        setServerStatus("Socket.IO biblioteka nepasiekiama");
        return;
    }

    if (!socket) {
        socket = window.io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            timeout: 10000
        });

        socket.on("connect", () => {
            setServerStatus("Serveris prijungtas");
            updateOnlineCount();
            sendPlayerUpdate();
        });

        socket.on("connect_error", () => {
            setServerStatus("Serverio prisijungimo klaida");
        });

        socket.on("disconnect", () => {
            setServerStatus("Serveris atjungtas");
            updateOnlineCount();
        });

        socket.on("playersUpdate", players => {
            if (!Array.isArray(players)) return;

            const received = new Set();

            players.forEach(data => {
                if (!data || data.id === socket.id) return;

                received.add(data.id);
                addOtherPlayer(data);
            });

            for (const id of otherPlayers.keys()) {
                if (!received.has(id)) {
                    removeOtherPlayer(id);
                }
            }

            updateOnlineCount();
        });

        socket.on("playerJoined", addOtherPlayer);
        socket.on("playerMoved", updateOtherPlayer);

        socket.on("playerLeft", data => {
            if (data?.id) removeOtherPlayer(data.id);
            updateOnlineCount();
        });

        socket.on("adminMessage", data => {
            if (!announcement) return;

            announcement.textContent =
                data?.message || "";

            announcement.style.display = "block";

            setTimeout(() => {
                announcement.style.display = "none";
            }, 6000);
        });

        socket.on("serverNotice", data => {
            alert(data?.message || "Serverio pranešimas");
            exitGame();
        });

        socket.on("banned", data => {
            alert(data?.message || "Prisijungimas nutrauktas");
            exitGame();
        });

    } else {
        socket.connect();
    }
}

function sendPlayerUpdate() {
    if (!socket?.connected || !player) return;

    socket.emit("playerMove", {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotation: player.rotation.y,
        username: playerName,
        color: playerColor,
        equipment: { ...equipment },

        // Server must relay these fields
        invisible: admin.invisible,
        flying: admin.fly
    });
}

// ==========================================
// WORLD
// ==========================================

function createWorld() {
    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.Fog(0x071426, 45, 160);

    camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.1,
        300
    );

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    gameElement.style.position = "relative";
    gameElement.style.overflow = "hidden";
    gameElement.style.width = "100%";
    gameElement.style.height = "100vh";

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    gameElement.appendChild(renderer.domElement);

    scene.add(
        new THREE.HemisphereLight(
            0xb9eaff,
            0x182030,
            2
        )
    );

    const sunlight = new THREE.DirectionalLight(
        0xffffff,
        2
    );

    sunlight.position.set(20, 35, 20);
    sunlight.castShadow = true;
    scene.add(sunlight);

    createGround();
    createCity();
    createStreetLights();

    player = createAvatar(playerColor, equipment);
    scene.add(player);

    resizeGame();

    window.addEventListener("resize", resizeGame);
}

// ==========================================
// GROUND
// ==========================================

function createGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({
            color: 0x172536,
            roughness: 0.9
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(
        180,
        90,
        0x087caa,
        0x243c50
    );

    grid.position.y = 0.02;
    scene.add(grid);

    createRoad(0, 0, 180, 10);
    createRoad(0, 0, 10, 180);
}

function createRoad(x, z, width, height) {
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshStandardMaterial({
            color: 0x101923
        })
    );

    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.04, z);
    scene.add(road);
}

// ==========================================
// CITY
// ==========================================

function createCity() {
    for (let x = -66; x <= 66; x += 22) {
        for (let z = -66; z <= 66; z += 22) {
            if (Math.abs(x) < 15 || Math.abs(z) < 15) {
                continue;
            }

            createBuilding(x, z);
        }
    }
}

function createBuilding(x, z) {
    const height = 7 + Math.random() * 17;
    const width = 6 + Math.random() * 5;

    const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, width),
        new THREE.MeshStandardMaterial({
            color: 0x263b53,
            metalness: 0.4,
            roughness: 0.6
        })
    );

    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;

    scene.add(building);

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(
            width + 0.2,
            0.15,
            width + 0.2
        ),
        new THREE.MeshBasicMaterial({
            color: 0x00cfff
        })
    );

    roof.position.set(x, height + 0.05, z);
    scene.add(roof);

    for (let y = 2; y < height - 1; y += 3) {
        for (const side of [-1, 1]) {
            const windowMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 1, 0.08),
                new THREE.MeshBasicMaterial({
                    color: 0x00cfff
                })
            );

            windowMesh.position.set(
                x + side * (width / 2 + 0.05),
                y,
                z
            );

            scene.add(windowMesh);
        }
    }
}

function createStreetLights() {
    for (let i = 0; i < 24; i++) {
        const light = new THREE.PointLight(
            i % 2 === 0 ? 0x00ccff : 0xaa44ff,
            2,
            20
        );

        light.position.set(
            Math.random() * 120 - 60,
            5,
            Math.random() * 120 - 60
        );

        scene.add(light);
    }
}

// ==========================================
// PLAYER
// ==========================================

function createAvatar(color, selected = equipment) {
    const group = new THREE.Group();

    const outfitColor =
        COLORS.outfit[selected.outfit] ||
        COLORS.outfit.default;

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.48, 0.9, 5, 10),
        new THREE.MeshStandardMaterial({
            color: outfitColor,
            metalness: 0.3,
            roughness: 0.5
        })
    );

    body.position.y = 1.15;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 20),
        new THREE.MeshStandardMaterial({
            color: color
        })
    );

    head.position.y = 2.05;
    head.castShadow = true;
    group.add(head);

    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 12, 12),
            new THREE.MeshBasicMaterial({
                color: 0x111111
            })
        );

        eye.position.set(side * 0.12, 2.12, 0.30);
        group.add(eye);
    }

    const accessoryColor =
        COLORS.weapon[selected.weapon] ||
        COLORS.weapon.neon;

    const accessory = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.13, 0.8),
        new THREE.MeshStandardMaterial({
            color: accessoryColor,
            emissive: accessoryColor,
            emissiveIntensity: 0.35
        })
    );

    accessory.position.set(0.55, 1.25, 0.2);
    group.add(accessory);

    const shieldColor =
        COLORS.shield[selected.shield] ||
        COLORS.shield.blue;

    const shield = new THREE.Mesh(
        new THREE.SphereGeometry(
            0.55, 16, 16, 0, Math.PI * 2, 0, Math.PI
        ),
        new THREE.MeshStandardMaterial({
            color: shieldColor,
            transparent: true,
            opacity: 0.35
        })
    );

    shield.position.set(-0.65, 1.25, 0);
    shield.scale.set(0.45, 1.2, 0.3);
    group.add(shield);

    return group;
}

// ==========================================
// OTHER PLAYERS
// ==========================================

function addOtherPlayer(data) {
    if (!data?.id || data.id === socket?.id || !scene) {
        return;
    }

    let object = otherPlayers.get(data.id);

    if (object) {
        scene.remove(object);
    }

    object = createAvatar(
        data.color || "#ff55aa",
        data.equipment || {}
    );

    object.position.set(
        Number(data.x) || 0,
        Number(data.y) || 0,
        Number(data.z) || 0
    );

    object.rotation.y = Number(data.rotation) || 0;

    // Requires server to relay invisible state
    object.visible = data.invisible !== true;

    scene.add(object);
    otherPlayers.set(data.id, object);
}

function updateOtherPlayer(data) {
    if (!data?.id) return;

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

    if (object && scene) {
        scene.remove(object);
    }

    otherPlayers.delete(id);
}

// ==========================================
// ADMIN CONTROL PANEL
// ==========================================

function createAdminMenu() {
    if (!checkAdmin()) return;

    if ($("neoAdminGamePanel")) return;

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
                <span>Speed</span>
                <input
                    type="range"
                    id="adminSpeed"
                    min="4"
                    max="30"
                    value="8"
                >
                <span id="adminSpeedValue">8</span>
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
            top:12px;
            right:12px;
            z-index:1000;
            width:205px;
            padding:12px;
            color:white;
            background:rgba(5,13,27,.94);
            border:1px solid #00dfff;
            border-radius:12px;
            font:14px Arial,sans-serif;
            box-shadow:0 0 18px #007b99;
        }

        .neo-admin-title {
            color:#00eaff;
            font-weight:bold;
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:10px;
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
            margin-top:12px;
        }

        .neo-admin-field input {
            width:100%;
        }

        #neoAdminGamePanel button {
            padding:9px;
            margin-top:8px;
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
            font-size:12px;
        }

        #touchControls {
            position:absolute;
            bottom:15px;
            left:15px;
            z-index:900;
        }

        .neo-pad button {
            width:55px;
            height:48px;
            margin:3px;
            border:1px solid #00dfff;
            border-radius:10px;
            background:rgba(0,30,50,.8);
            color:white;
            font-size:20px;
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
        updateAdminStatus();
    };

    $("adminGod").onchange = event => {
        admin.godMode = event.target.checked;
        updateAdminStatus();
    };

    $("adminFly").onchange = event => {
        admin.fly = event.target.checked;
        updateAdminStatus();
    };

    $("adminSpeed").oninput = event => {
        admin.speed = Number(event.target.value);
        $("adminSpeedValue").textContent = admin.speed;
    };

    $("adminTeleport").onclick = () => {
        if (!player) return;

        player.position.set(0, 0, 0);
        sendPlayerUpdate();
        updateAdminStatus("Teleported to center");
    };

    $("adminReset").onclick = resetAdminPowers;
}

function updateAdminStatus(message) {
    if (!admin.enabled) return;

    const status = $("adminPowerStatus");

    if (!status) return;

    status.textContent = message || "Admin powers updated";
}

function resetAdminPowers() {
    if (!checkAdmin()) return;

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

// ==========================================
// MOVEMENT
// ==========================================

function movePlayer(delta) {
    if (!player) return;

    const direction = new THREE.Vector3();

    if (keys.forward) direction.z += 1;
    if (keys.backward) direction.z -= 1;
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
    }

    player.position.x = THREE.MathUtils.clamp(
        player.position.x, -75, 75
    );

    player.position.z = THREE.MathUtils.clamp(
        player.position.z, -75, 75
    );

    player.rotation.y = Math.atan2(
        direction.x,
        direction.z
    );
}

// ==========================================
// KEYBOARD
// ==========================================

function setupKeyboard() {
    window.addEventLi