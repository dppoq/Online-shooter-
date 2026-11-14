import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// ================================
// NEO SHOOTER 3D
// ================================

const socket = window.io();

const gameElement = document.getElementById("game");
const menuElement = document.getElementById("menu");
const playButton = document.getElementById("playButton");
const exitButton = document.getElementById("exitButton");
const playerInfo = document.getElementById("playerInfo");
const onlinePlayers = document.getElementById("onlinePlayers");
const announcement = document.getElementById("adminAnnouncement");

let scene;
let camera;
let renderer;
let player;
let animationId;
let gameRunning = false;
let lastNetworkUpdate = 0;

const otherPlayers = new Map();

const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

const savedEquipment = JSON.parse(
    localStorage.getItem("neoEquipment") || "{}"
);

const equipment = {
    weapon: savedEquipment.weapon || "neon",
    shield: savedEquipment.shield || "blue",
    outfit: savedEquipment.outfit || "default"
};

let playerName = localStorage.getItem("neoUsername") || "Žaidėjas";
let playerColor = localStorage.getItem("neoColor") || "#00eaff";

const cosmeticColors = {
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

// ================================
// WORLD
// ================================

function createWorld() {
    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.Fog(0x071426, 35, 150);

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

    gameElement.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(
        0xb9eaff,
        0x182030,
        2
    );

    scene.add(ambient);

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

    // Grid

    const grid = new THREE.GridHelper(
        180,
        90,
        0x087caa,
        0x243c50
    );

    grid.position.y = 0.02;
    scene.add(grid);

    // Roads

    createRoad(0, 0, 180, 9);
    createRoad(0, 0, 9, 180);

    // Buildings

    for (let x = -65; x <= 65; x += 22) {
        for (let z = -65; z <= 65; z += 22) {
            if (Math.abs(x) < 15 || Math.abs(z) < 15) {
                continue;
            }

            createBuilding(x, z);
        }
    }

    // Neon decorations

    for (let i = 0; i < 18; i++) {
        const light = new THREE.PointLight(
            i % 2 === 0 ? 0x00ccff : 0xaa44ff,
            2,
            18
        );

        light.position.set(
            Math.random() * 120 - 60,
            4,
            Math.random() * 120 - 60
        );

        scene.add(light);
    }

    createPlayer();

    window.addEventListener("resize", resizeGame);
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

function createBuilding(x, z) {
    const height = 5 + Math.random() * 15;
    const width = 6 + Math.random() * 5;

    const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, width),
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

    // Windows

    for (let y = 2; y < height - 1; y += 3) {
        for (let side = -1; side <= 1; side += 2) {
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

// ================================
// AVATAR
// ================================

function createAvatar(color, avatarEquipment = equipment) {
    const group = new THREE.Group();

    const outfitColor =
        cosmeticColors.outfit[avatarEquipment.outfit] ||
        cosmeticColors.outfit.default;

    // Body

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.48, 0.9, 5, 10),
        new THREE.MeshStandardMaterial({
            color: outfitColor
        })
    );

    body.position.y = 1.15;
    body.castShadow = true;

    group.add(body);

    // Head

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 20),
        new THREE.MeshStandardMaterial({
            color: color
        })
    );

    head.position.y = 2.05;
    head.castShadow = true;

    group.add(head);

    // Face

    const face = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 10),
        new THREE.MeshBasicMaterial({
            color: 0xffffff
        })
    );

    face.position.set(0, 2.08, 0.31);

    group.add(face);

    // Eyes

    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 12, 12),
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

    // Decorative cosmetic accessory
    // This is visual only and has no firing or combat function.

    const accessoryColor =
        cosmeticColors.weapon[avatarEquipment.weapon] ||
        cosmeticColors.weapon.neon;

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

    // Shield cosmetic

    const shieldColor =
        cosmeticColors.shield[avatarEquipment.shield] ||
        cosmeticColors.shield.blue;

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
            opacity: 0.35,
            metalness: 0.5,
            roughness: 0.3
        })
    );

    shield.position.set(-0.65, 1.25, 0);
    shield.scale.set(0.45, 1.2, 0.3);

    group.add(shield);

    return group;
}

function createPlayer() {
    player = createAvatar(playerColor, equipment);

    player.position.set(0, 0, 0);

    scene.add(player);
}

// ================================
// OTHER PLAYERS
// ================================

function addOtherPlayer(data) {
    if (!data || !data.id || data.id === socket.id) {
        return;
    }

    let object = otherPlayers.get(data.id);

    if (!object) {
        object = createAvatar(
            data.color || "#ff55aa",
            data.equipment || {}
        );

        scene.add(object);
        otherPlayers.set(data.id, object);
    }

    object.position.set(
        Number(data.x) || 0,
        0,
        Number(data.z) || 0
    );

    object.rotation.y = Number(data.rotation) || 0;
}

function removeOtherPlayer(id) {
    const object = otherPlayers.get(id);

    if (object) {
        scene.remove(object);
        otherPlayers.delete(id);
    }
}

function updateOtherPlayer(data) {
    if (!data || !data.id) return;

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

    object.rotation.y = Number(data.rotation) || 0;
}

// ================================
// MULTIPLAYER
// ================================

function connectServer() {
    socket.connect();

    socket.on("connect", () => {
        console.log("Connected to Neo Shooter server");

        updateOnlineCount();
    });

    socket.on("playersUpdate", (players) => {
        if (!Array.isArray(players)) return;

        const receivedIds = new Set();

        players.forEach(data => {
            if (data.id === socket.id) return;

            receivedIds.add(data.id);
            addOtherPlayer(data);
        });

        for (const id of otherPlayers.keys()) {
            if (!receivedIds.has(id)) {
                removeOtherPlayer(id);
            }
        }

        updateOnlineCount();
    });

    socket.on("playerJoined", (data) => {
        addOtherPlayer(data);
        updateOnlineCount();
    });

    socket.on("playerMoved", (data) => {
        updateOtherPlayer(data);
    });

    socket.on("playerLeft", (data) => {
        removeOtherPlayer(data.id);
        updateOnlineCount();
    });

    socket.on("adminMessage", (data) => {
        if (!announcement) return;

        announcement.textContent = data.message || "";
        announcement.style.display = "block";

        setTimeout(() => {
            announcement.style.display = "none";
        }, 6000);
    });

    socket.on("serverNotice", (data) => {
        alert(data.message || "Serverio pranešimas");
        exitGame();
    });

    socket.on("banned", (data) => {
        alert(data.message || "Tavo prisijungimas nutrauktas.");
        exitGame();
    });

    socket.on("disconnect", () => {
        updateOnlineCount();
    });
}

function sendPlayerUpdate() {
    if (!socket.connected || !player) return;

    socket.emit("playerMove", {
        x: player.position.x,
        z: player.position.z,
        rotation: player.rotation.y,
        username: playerName,
        color: playerColor,
        equipment: equipment
    });
}

function updateOnlineCount() {
    if (onlinePlayers) {
        onlinePlayers.textContent =
            "Prisijungę žaidėjai: " +
            (socket.connected ? otherPlayers.size + 1 : 0);
    }
}

// ================================
// MOVEMENT
// ================================

function movePlayer(delta) {
    if (!player) return;

    const speed = 8;
    const direction = new THREE.Vector3();

    if (keys.forward) direction.z += 1;
    if (keys.backward) direction.z -= 1;
    if (keys.left) direction.x -= 1;
    if (keys.right) direction.x += 1;

    if (direction.length() > 0) {
        direction.normalize();

        player.position.x += direction.x * speed * delta;
        player.position.z += direction.z * speed * delta;

        player.position.x = THREE.MathUtils.clamp(
            player.position.x,
            -75,
            75
        );

        player.position.z = THREE.MathUtils.clamp(
            player.position.z,
            -75,
            75
        );

        player.rotation.y = Math.atan2(
            direction.x,
            direction.z
        );
    }
}

function setupKeyboard() {
    window.addEventListener("keydown", (event) => {
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

    window.addEventListener("keyup", (event) => {
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
}

// ================================
// MOBILE CONTROLS
// ================================

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
        const key = button.dataset.key;

        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            keys[key] = true;
        });

        button.addEventListener("pointerup", () => {
            keys[key] = false;
        });

        button.addEventListener("pointerleave", () => {
            keys[key] = false;
        });

        button.addEventListener("pointercancel", () => {
            keys[key] = false;
        });
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

// ================================
// FRONT THIRD-PERSON CAMERA
// ================================

function updateCamera() {
    if (!player || !camera) return;

    const forward = new THREE.Vector3(
        Math.sin(player.rotation.y),
        0,
        Math.cos(player.rotation.y)
    );

    const targetCamera = new THREE.Vector3(
        player.position.x + forward.x * 8,
        player.position.y + 3.2,
        player.position.z + forward.z * 8
    );

    camera.position.lerp(targetCamera, 0.09);

    camera.lookAt(
        player.position.x,
        player.position.y + 1.1,
        player.position.z
    );
}

// ================================
// ANIMATION
// ================================

let previousTime = 0;

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

    if (time - lastNetworkUpdate > 80) {
        sendPlayerUpdate();
        lastNetworkUpdate = time;
    }

    renderer.render(scene, camera);
}

// ================================
// GAME START / EXIT
// ================================

function startGame() {
    if (gameRunning) return;

    if (!scene) {
        createWorld();
    }

    gameRunning = true;

    if (menuElement) {
        menuElement.style.display = "none";
    }

    gameElement.style.display = "block";

    setupTouchControls();

    if (!socket.connected) {
        connectServer();
    }

    previousTime = 0;
    animate();
}

function exitGame() {
    gameRunning = false;

    cancelAnimationFrame(animationId);

    hideTouchControls();

    if (menuElement) {
        menuElement.style.display = "flex";
    }

    if (gameElement) {
        gameElement.style.display = "none";
    }

    socket.disconnect();

    otherPlayers.forEach(object => {
        scene.remove(object);
    });

    otherPlayers.clear();
}

// ================================
// AVATAR MENU
// ================================

function saveAvatar() {
    localStorage.setItem("neoUsername", playerName);
    localStorage.setItem("neoColor", playerColor);

    if (playerInfo) {
        playerInfo.textContent = playerName;
    }
}

// ================================
// EQUIPMENT MENU
// ================================

function saveEquipment() {
    localStorage.setItem(
        "neoEquipment",
        JSON.stringify(equipment)
    );

    if (player && scene) {
        const oldPosition = player.position.clone();
        const oldRotation = player.rotation.y;

        scene.remove(player);

        player = createAvatar(playerColor, equipment);

        player.position.copy(oldPosition);
        player.rotation.y = oldRotation;

        scene.add(player);
    }
}

// ================================
// MENU PANELS
// ================================

function showPanel(panelName) {
    const panel = document.getElementById("menuPanel");

    if (!panel) return;

    panel.style.display = "block";

    if (panelName === "avatar") {
        panel.innerHTML = `
            <h2>Avataras</h2>

            <label>Žaidėjo vardas</label>
            <input id="avatarName" maxlength="18"
                value="${escapeHTML(playerName)}">

            <label>Avataro spalva</label>
            <input id="avatarColor" type="color"
                value="${playerColor}">

            <button id="saveAvatar">Išsaugoti</button>
        `;

        document.getElementById("saveAvatar").onclick = () => {
            playerName = cleanName(
                document.getElementById("avatarName").value
            );

            playerColor =
                document.getElementById("avatarColor").value;

            saveAvatar();

            alert("Avataras išsaugotas!");
        };
    }

    else if (panelName === "equipment") {
        panel.innerHTML = `
            <h2>Įranga ir skinai</h2>

            <label>Ginklo išvaizda</label>
            <select id="weaponSkin">
                <option value="neon">Neon</option>
                <option value="gold">Gold</option>
                <option value="ice">Ice</option>
                <option value="purple">Purple</option>
                <option value="red">Red</option>
            </select>

            <label>Skydo skinas</label>
            <select id="shieldSkin">
                <option value="blue">Blue</option>
                <option value="gold">Gold</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
            </select>

            <label>Apranga</label>
            <select id="outfitSkin">
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="red">Red</option>
                <option value="gold">Gold</option>
            </select>

            <button id="equipButton">EQUIP</button>
            <button id="resetEqui