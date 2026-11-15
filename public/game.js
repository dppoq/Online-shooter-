 
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// =====================================
// NEO SHOOTER 3D - NEW VERSION
// =====================================

const menu = document.getElementById("menu");
const gameElement = document.getElementById("game");
const playButton = document.getElementById("playButton");
const exitButton = document.getElementById("exitButton");
const playerInfo = document.getElementById("playerInfo");
const onlinePlayers = document.getElementById("onlinePlayers");
const announcement = document.getElementById("adminAnnouncement");
const serverStatus = document.getElementById("serverStatus");
const menuPanel = document.getElementById("menuPanel");

let scene = null;
let camera = null;
let renderer = null;
let player = null;
let socket = null;

let gameRunning = false;
let animationId = null;
let previousTime = 0;
let lastNetworkUpdate = 0;

const otherPlayers = new Map();

const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

let playerName = localStorage.getItem("neoUsername") || "Žaidėjas";
let playerColor = localStorage.getItem("neoColor") || "#00eaff";

let equipment = {
    weapon: "neon",
    shield: "blue",
    outfit: "default"
};

try {
    const saved = JSON.parse(
        localStorage.getItem("neoEquipment") || "{}"
    );

    equipment = { ...equipment, ...saved };
} catch (error) {
    console.warn("Equipment settings could not be loaded.");
}

const colors = {
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

// =====================================
// HELPERS
// =====================================

function setServerStatus(message) {
    if (serverStatus) {
        serverStatus.textContent = message;
    }
}

function updateOnlineCount() {
    if (onlinePlayers) {
        onlinePlayers.textContent =
            "Online: " + (socket?.connected ? otherPlayers.size + 1 : 0);
    }
}

function cleanName(value) {
    return String(value || "Žaidėjas")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 18) || "Žaidėjas";
}

// =====================================
// SERVER CONNECTION
// =====================================

function connectServer() {
    if (socket?.connected) return;

    if (typeof window.io !== "function") {
        setServerStatus("Serverio biblioteka nepasiekiama");
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
            setServerStatus("Server connected");
            updateOnlineCount();
            sendPlayerUpdate();
        });

        socket.on("connect_error", () => {
            setServerStatus("Server offline");
        });

        socket.on("disconnect", () => {
            setServerStatus("Server disconnected");
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

            announcement.textContent = data?.message || "";
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
        z: player.position.z,
        rotation: player.rotation.y,
        username: playerName,
        color: playerColor,
        equipment: { ...equipment }
    });
}

// =====================================
// 3D WORLD
// =====================================

function createWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.Fog(0x071426, 40, 160);

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

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    gameElement.appendChild(renderer.domElement);

    // Lighting
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

    // Ground
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

    // Neon grid
    const grid = new THREE.GridHelper(
        180,
        90,
        0x087caa,
        0x243c50
    );

    grid.position.y = 0.02;
    scene.add(grid);

    // Roads
    createRoad(0, 0, 180, 10);
    createRoad(0, 0, 10, 180);

    // City buildings
    for (let x = -66; x <= 66; x += 22) {
        for (let z = -66; z <= 66; z += 22) {
            if (Math.abs(x) < 15 || Math.abs(z) < 15) {
                continue;
            }

            createBuilding(x, z);
        }
    }

    // Neon street lights
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

    // Player
    player = createAvatar(playerColor, equipment);
    scene.add(player);

    window.addEventListener("resize", resizeGame);
}

// =====================================
// ROADS
// =====================================

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

// =====================================
// BUILDINGS
// =====================================

function createBuilding(x, z) {
    const height = 7 + Math.random() * 17;
    const width = 6 + Math.random() * 5;

    const building = new THREE.Mesh(
        new THREE.BoxGeometry(
            width,
            height,
            width
        ),
        new THREE.MeshStandardMaterial({
            color: 0x263b53,
            metalness: 0.4,
            roughness: 0.6
        })
    );

    building.position.set(
        x,
        height / 2,
        z
    );

    building.castShadow = true;
    building.receiveShadow = true;

    scene.add(building);

    // Neon roof
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

    roof.position.set(
        x,
        height + 0.05,
        z
    );

    scene.add(roof);

    // Windows
    for (let y = 2; y < height - 1; y += 3) {
        for (const side of [-1, 1]) {
            const windowMesh = new THREE.Mesh(
                new THREE.BoxGeometry(
                    0.8,
                    1,
                    0.08
                ),
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

// =====================================
// PLAYER AVATAR
// =====================================

function createAvatar(color, selected = equipment) {
    const group = new THREE.Group();

    const outfitColor =
        colors.outfit[selected.outfit] ||
        colors.outfit.default;

    // Body
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(
            0.48,
            0.9,
            5,
            10
        ),
        new THREE.MeshStandardMaterial({
            color: outfitColor,
            metalness: 0.3,
            roughness: 0.5
        })
    );

    body.position.y = 1.15;
    body.castShadow = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(
            0.34,
            20,
            20
        ),
        new THREE.MeshStandardMaterial({
            color: color
        })
    );

    head.position.y = 2.05;
    head.castShadow = true;
    group.add(head);

    // Eyes
    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(
                0.045,
                12,
                12
            ),
            new THREE.MeshBasicMaterial({
                color: 0x111111
            })
        );

        eye.position.set(
            side * 0.12,
            2.12,
            0.30
        );

        group.add(eye);
    }

    // Decorative cosmetic item
    const accessoryColor =
        colors.weapon[selected.weapon] ||
        colors.weapon.neon;

    const accessory = new THREE.Mesh(
        new THREE.BoxGeometry(
            0.13,
            0.13,
            0.8
        ),
        new THREE.MeshStandardMaterial({
            color: accessoryColor,
            emissive: accessoryColor,
            emissiveIntensity: 0.35
        })
    );

    accessory.position.set(
        0.55,
        1.25,
        0.2
    );

    group.add(accessory);

    // Energy shield
    const shieldColor =
        colors.shield[selected.shield] ||
        colors.shield.blue;

    const shield = new THREE.Mesh(
        new THREE.SphereGeometry(
            0.55,
            16,
            16,
            0,
            Math.PI * 2,
            0,
            Math.PI
        ),
        new THREE.MeshStandardMaterial({
            color: shieldColor,
            transparent: true,
            opacity: 0.35
        })
    );

    shield.position.set(
        -0.65,
        1.25,
        0
    );

    shield.scale.set(
        0.45,
        1.2,
        0.3
    );

    group.add(shield);

    return group;
}

// =====================================
// OTHER PLAYERS
// =====================================

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
        0,
        Number(data.z) || 0
    );

    object.rotation.y =
        Number(data.rotation) || 0;

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
        0,
        Number(data.z) || 0
    );

    object.rotation.y =
        Number(data.rotation) || 0;
}

function removeOtherPlayer(id) {
    const object = otherPlayers.get(id);

    if (object && scene) {
        scene.remove(object);
    }

    otherPlayers.delete(id);
}

// =====================================
// PLAYER MOVEMENT
// =====================================

function movePlayer(delta) {
    if (!player) return;

    const direction = new THREE.Vector3();

    if (keys.forward) direction.z += 1;
    if (keys.backward) direction.z -= 1;
    if (keys.left) direction.x -= 1;
    if (keys.right) direction.x += 1;

    if (direction.lengthSq() === 0) return;

    direction.normalize();

    const speed = 8;

    player.position.x += direction.x * speed * delta;
    player.position.z += direction.z * speed * delta;

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

// =====================================
// KEYBOARD CONTROLS
// =====================================

function setupKeyboard() {
    window.addEventListener("keydown", event => {
        if (event.target.matches("input, textarea, select")) return;

        switch (event.key.toLowerCase()) {
            case "w":
            case "arrowup":
                keys.forward = true;
                break;

            case "s":
            case "arrowdown":
                keys.backward = true;
                break;

            case "a":
            case "arrowleft":
                keys.left = true;
                break;

            case "d":
            case "arrowright":
                keys.right = true;
                break;
        }
    });

    window.addEventListener("keyup", event => {
        switch (event.key.toLowerCase()) {
            case "w":
            case "arrowup":
                keys.forward = false;
                break;

            case "s":
            case "arrowdown":
                keys.backward = false;
                break;

            case "a":
            case "arrowleft":
                keys.left = false;
                break;

            case "d":
            case "arrowright":
                keys.right = false;
                break;
        }
    });

    window.addEventListener("blur", () => {
        Object.keys(keys).forEach(key => {
            keys[key] = false;
        });
    });
}

// =====================================
// MOBILE TOUCH CONTROLS
// =====================================

function setupTouchControls() {
    let controls = document.getElementById("touchControls");

    if (!controls) {
        controls = document.createElement("div");
        controls.id = "touchControls";

        controls.innerHTML = `
            <div class="neo-pad">
                <button data-key="forward">▲</button>
                <div>
                    <button data-key="left">◀</button>
                    <button data-key="backward">▼</button>
                    <button data-key="right">▶</button>
                </div>
            </div>
        `;

        gameElement.appendChild(controls);
    }

    controls.style.display = "block";

    controls.querySelectorAll("button").forEach(button => {
        if (button.dataset.ready) return;

        button.dataset.ready = "yes";

        const key = button.dataset.key;

        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            keys[key] = true;
        });

        const release = () => {
            keys[key] = false;
        };

        button.addEventListener("pointerup", release);
        button.addEventListener("pointerleave", release);
        button.addEventListener("pointercancel", release);
    });
}

function hideTouchControls() {
    const controls = document.getElementById("touchControls");

    if (controls) {
        controls.style.display = "none";
    }

    Object.keys(keys).forEach(key => {
        keys[key] = false;
    });
}

// =====================================
// THIRD PERSON CAMERA
// =====================================

function updateCamera() {
    if (!player || !camera) return;

    const forward = new THREE.Vector3(
        Math.sin(player.rotation.y),
        0,
        Math.cos(player.rotation.y)
    );

    const target = new THREE.Vector3(
        player.position.x - forward.x * 6,
        player.position.y + 3,
        player.position.z - forward.z * 6
    );

    camera.position.lerp(target, 0.09);

    camera.lookAt(
        player.position.x,
        player.position.y + 1.2,
        player.position.z
    );
}

// =====================================
// LANDSCAPE AND FULLSCREEN
// =====================================

async function enterGameDisplay() {
    try {
        if (!document.fullscreenElement &&
            gameElement.requestFullscreen) {
            await gameElement.requestFullscreen();
        }
    } catch (error) {
        console.log("Fullscreen unavailable");
    }

    try {
        if (screen.orientation?.lock) {
            await screen.orientation.lock("landscape");
        }
    } catch (error) {
        console.log("Landscape lock unavailable");
    }

    resizeGame();
}

// =====================================
// GAME ANIMATION
// =====================================

function animate(time = 0) {
    if (!gameRunning) return;

    animationId = requestAnimationFrame(animate);

    const delta = Math.min(
        (time - previousTime) / 1000 || 0,
        0.05
    );

    previousTime = time;

    movePlayer(delta);
    updateCamera();

    if (time - lastNetworkUpdate > 100) {
        sendPlayerUpdate();
        lastNetworkUpdate = time;
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// =====================================
// START GAME
// =====================================

async function startGame() {
    if (gameRunning) return;

    if (!scene) {
        createWorld();
    }

    gameRunning = true;

    if (menu) menu.hidden = true;
    if (gameElement) gameElement.hidden = false;

    setupTouchControls();

    connectServer();

    previousTime = 0;
    lastNetworkUpdate = 0;

    await enterGameDisplay();

    animate();
}

// =====================================
// EXIT GAME
// =====================================

function exitGame() {
    gameRunning = false;

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    hideTouchControls();

    if (menu) menu.hidden = false;
    if (gameElement) gameElement.hidden = true;

    if (socket) {
        socket.disconnect();
    }

    if (scene) {
        otherPlayers.forEach(object => {
            scene.remove(object);
        });
    }

    otherPlayers.clear();

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    try {
        screen.orientation?.unlock();
    } catch (error) {}

    updateOnlineCount();
}

// =====================================
// RESIZE GAME
// =====================================

function resizeGame() {
    if (!camera || !renderer) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// =====================================
// SAVE PLAYER SETTINGS
// =====================================

function saveAvatar() {
    localStorage.setItem("neoUsername", playerName);
    localStorage.setItem("neoColor", playerColor);

    if (playerInfo) {
        playerInfo.textContent = playerName;
    }
}

function saveEquipment() {
    localStorage.setItem(
        "neoEquipment",
        JSON.stringify(equipment)
    );

    if (scene && player) {
        const position = player.position.clone();
        const rotation = player.rotation.y;

        scene.remove(player);

        player = createAvatar(playerColor, equipment);

        player.position.copy(position);
        player.rotation.y = rotation;

        scene.add(player);
    }

    sendPlayerUpdate();
}

// =====================================
// HTML SAFETY
// =====================================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// =====================================
// MENU PANELS
// =====================================

function showPanel(name) {
    if (!menuPanel) return;

    menuPanel.hidden = false;

    if (name === "avatar") {
        menuPanel.innerHTML = `
            <h2>AVATAR</h2>

            <label>Player name</label>
            <input id="avatarName" maxlength="18">

            <label>Avatar color</label>
            <input id="avatarColor" type="color">

            <button id="saveAvatarButton">SAVE</button>
        `;

        document.getElementById("avatarName").value = playerName;
        document.getElementById("avatarColor").value = playerColor;

        document.getElementById("saveAvatarButton").onclick = () => {
            playerName = cleanName(
                document.getElementById("avatarName").value
            );

            playerColor =
                document.getElementById("avatarColor").value;

            saveAvatar();

            if (scene && player) {
                const position = player.position.clone();
                const rotation = player.rotation.y;

                scene.remove(player);

                player = createAvatar(playerColor, equipment);
                player.position.copy(position);
                player.rotation.y = rotation;

                scene.add(player);
            }

            sendPlayerUpdate();
            alert("Avatar saved!");
        };
    }

    else if (name === "equipment") {
        menuPanel.innerHTML = `
            <h2>STYLE AND EQUIPMENT</h2>

            <label>Cosmetic item</label>
            <select id="weaponSkin">
                <option value="neon">Neon</option>
                <option value="gold">Gold</option>
                <option value="ice">Ice</option>
                <option value="purple">Purple</option>
                <option value="red">Red</option>
            </select>

            <label>Shield skin</label>
            <select id="shieldSkin">
                <option value="blue">Blue</option>
                <option value="gold">Gold</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
            </select>

            <label>Outfit</label>
            <select id="outfitSkin">
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="red">Red</option>
                <option value="gold">Gold</option>
            </select>

            <button id="equipButton">EQUIP</button>
            <button id="resetEquipment">RESET</button>
        `;

        document.getElementById("weaponSkin").value = equipment.weapon;
        document.getElementById("shieldSkin").value = equipment.shield;
        document.getElementById("outfitSkin").value = equipment.outfit;

        document.getElementById("equipButton").onclick = () => {
            equipment.weapon =
                document.getElementById("weaponSkin").value;

            equipment.shield =
                document.getElementById("shieldSkin").value;

            equipment.outfit =
                document.getElementById("outfitSkin").value;

            saveEquipment();
            alert("Cosmetics equipped!");
        };

        document.getElementById("resetEquipment").onclick = () => {
            equipment.weapon = "neon";
            equipment.shield = "blue";
            equipment.outfit = "default";

            saveEquipment();
            showPanel("equipment");
        };
    }

    else if (name === "events") {
        menuPanel.innerHTML = `
            <h2>EVENTS</h2>
            <p>New events coming soon.</p>
            <p>Cosmetic rewards and special items.</p>
        `;
    }

    else if (name === "season") {
        menuPanel.innerHTML = `
            <h2>SEASON 1</h2>
            <p>Neo Season 1</p>
            <p>Season rewards coming soon.</p>
        `;
    }

    else if (name === "settings") {
        menuPanel.innerHTML = `
            <h2>SETTINGS</h2>
            <p>Movement: W A S D or mobile buttons.</p>
            <p>Camera: third-person view.</p>
            <button id="closePanel">CLOSE</button>
        `;

        document.getElementById("closePanel").onclick = closePanel;
    }

    else if (name === "updates") {
        menuPanel.innerHTML = `
            <h2>UPDATES</h2>
            <p>Neo Shooter 3D</p>
            <p>New neon city and avatar customization.</p>
            <p>Mobile controls and multiplayer support.</p>
        `;
    }
}

// =====================================
// CLOSE MENU PANEL
// =====================================

function closePanel() {
    if (menuPanel) {
        menuPanel.hidden = true;
        menuPanel.innerHTML = "";
    }
}

// =====================================
// MENU BUTTONS
// =====================================

if (playButton) {
    playButton.addEventListener("click", startGame);
}

if (exitButton) {
    exitButton.addEventListener("click", exitGame);
}

document.querySelectorAll("[data-panel]").forEach(button => {
    button.addEventListener("click", () => {
        showPanel(button.dataset.panel);
    });
});

document.querySelectorAll("[data-close-panel]").forEach(button => {
    button.addEventListener("click", closePanel);
});

// =====================================
// INITIALIZE
// =====================================

if (playerInfo) {
    playerInfo.textContent = playerName;
}

setServerStatus("Ready");

setupKeyboard();

console.log("NEO SHOOTER 3D READY");
