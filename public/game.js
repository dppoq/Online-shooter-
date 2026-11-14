
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// NEO SHOOTER 3D

const $ = id => document.getElementById(id);

const socketUrl = window.location.origin;

let socket = null;
let scene = null;
let camera = null;
let renderer = null;
let player = null;
let clock = new THREE.Clock();

let running = false;
let animationId = null;
let lastSend = 0;

const otherPlayers = new Map();
const keys = {};

const position = { x: 0, z: 0 };
let rotation = 0;

const playerData = {
    username: localStorage.getItem("neoUsername") || "Player",
    color: localStorage.getItem("neoColor") || "#00d9ff"
};

const cosmetics = {
    weapons: [
        { id: "neon", name: "Neon", color: "#00eaff" },
        { id: "gold", name: "Gold", color: "#ffd700" },
        { id: "ice", name: "Ice", color: "#8beaff" },
        { id: "purple", name: "Purple", color: "#a855f7" },
        { id: "red", name: "Red", color: "#ff405c" }
    ],

    shields: [
        { id: "blue", name: "Blue Shield", color: "#168bff" },
        { id: "gold", name: "Gold Shield", color: "#ffd700" },
        { id: "green", name: "Green Shield", color: "#20e58a" },
        { id: "purple", name: "Purple Shield", color: "#a855f7" }
    ],

    outfits: [
        { id: "default", name: "Default", color: "#00d9ff" },
        { id: "dark", name: "Dark", color: "#30364a" },
        { id: "red", name: "Red", color: "#e94358" },
        { id: "gold", name: "Gold", color: "#d6a52c" }
    ]
};

function loadEquipment() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("neoEquipment") || "{}"
        );

        return {
            weapons: saved.weapons || "neon",
            shields: saved.shields || "blue",
            outfits: saved.outfits || "default"
        };
    } catch {
        return {
            weapons: "neon",
            shields: "blue",
            outfits: "default"
        };
    }
}

let equipped = loadEquipment();

function saveEquipment() {
    localStorage.setItem("neoEquipment", JSON.stringify(equipped));
}

// SERVER

function connectServer() {
    if (socket?.connected) return;

    socket = window.io(socketUrl);

    socket.on("connect", () => {
        setStatus("Prisijungta prie serverio");

        socket.emit("playerMove", {
            x: position.x,
            z: position.z,
            rotation,
            username: playerData.username,
            color: playerData.color
        });
    });

    socket.on("disconnect", () => {
        setStatus("Atsijungta nuo serverio");
    });

    socket.on("connect_error", () => {
        setStatus("Serverio prisijungimo klaida");
    });

    socket.on("playersUpdate", data => {
        const players = Array.isArray(data)
            ? data
            : Object.values(data || {});

        players.forEach(addOtherPlayer);
    });

    socket.on("playerJoined", addOtherPlayer);
    socket.on("playerMoved", moveOtherPlayer);

    socket.on("playerLeft", id => {
        removeOtherPlayer(id);
    });

    socket.on("adminMessage", data => {
        const message =
            typeof data === "string" ? data : data?.message;

        if ($("adminAnnouncement") && message) {
            $("adminAnnouncement").textContent = message;
        }
    });

    socket.on("banned", () => {
        alert("Administratorius uždarė tavo prisijungimą.");
        exitGame();
    });
}

function setStatus(message) {
    if ($("serverStatus")) {
        $("serverStatus").textContent = message;
    }
}

// 3D WORLD

function createWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8bc7ed);
    scene.fog = new THREE.Fog(0x8bc7ed, 55, 170);

    camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.1,
        300
    );

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 1.7)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    game.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(
        0xc5eaff,
        0x334455,
        1.7
    ));

    const sunlight = new THREE.DirectionalLight(
        0xffffff,
        2
    );

    sunlight.position.set(30, 50, 20);
    sunlight.castShadow = true;
    scene.add(sunlight);

    createGround();
    createRoads();
    createBuildings();

    player = createAvatar(
        playerData.color,
        equipped
    );

    player.position.set(position.x, 0, position.z);
    scene.add(player);

    // Kamera priešais veikėją
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 1, 0);

    // Sukuriame jau prisijungusius žaidėjus
    otherPlayers.forEach(data => {
        addOtherPlayer(data);
    });
}

function createGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({
            color: 0x354b45
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(
        180,
        45,
        0x668899,
        0x526b6b
    );

    grid.position.y = 0.04;
    scene.add(grid);
}

function createRoads() {
    const material = new THREE.MeshStandardMaterial({
        color: 0x303946
    });

    for (let i = -3; i <= 3; i++) {
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(180, 0.08, 7),
            material
        );

        road.position.set(0, 0.05, i * 24);
        scene.add(road);

        const crossRoad = new THREE.Mesh(
            new THREE.BoxGeometry(7, 0.08, 180),
            material
        );

        crossRoad.position.set(i * 24, 0.05, 0);
        scene.add(crossRoad);
    }
}

function createBuildings() {
    const colors = [
        0x536c8a,
        0x64748b,
        0x43556e,
        0x718096
    ];

    for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) {
            if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
                continue;
            }

            const height = 5 + Math.random() * 15;
            const width = 5 + Math.random() * 3;

            const building = new THREE.Mesh(
                new THREE.BoxGeometry(
                    width,
                    height,
                    width
                ),
                new THREE.MeshStandardMaterial({
                    color: colors[
                        Math.floor(Math.random() * colors.length)
                    ]
                })
            );

            building.position.set(
                x * 18,
                height / 2,
                z * 18
            );

            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);
        }
    }
}

// AVATAR

function createAvatar(color, equipment = equipped) {
    const group = new THREE.Group();

    const outfit = cosmetics.outfits.find(
        item => item.id === equipment.outfits
    );

    const outfitColor = outfit
        ? outfit.color
        : color;

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: outfitColor,
        roughness: 0.65
    });

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.48, 0.9, 4, 8),
        bodyMaterial
    );

    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0xffd2ad
        })
    );

    head.position.y = 1.95;
    group.add(head);

    // Akys, kad veikėjas būtų matomas iš priekio
    const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0x182033
    });

    for (const x of [-0.12, 0.12]) {
        const eye = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 8, 8),
            eyeMaterial
        );

        eye.position.set(x, 1.98, 0.32);
        group.add(eye);
    }

    // Kosmetinis aksesuaras – ginklo išvaizda
    const weapon = createCosmeticWeapon(
        equipment.weapons
    );

    weapon.position.set(0.75, 1.05, 0.18);
    group.add(weapon);

    // Kosmetinis skydas
    const shield = createCosmeticShield(
        equipment.shields
    );

    shield.position.set(-0.65, 1.15, 0.12);
    group.add(shield);

    return group;
}

function createCosmeticWeapon(id) {
    const item = cosmetics.weapons.find(
        value => value.id === id
    );

    const color = item ? item.color : "#00eaff";

    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.5,
        roughness: 0.35
    });

    const decorativeBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.65, 0.16),
        material
    );

    group.add(decorativeBody);

    const decoration = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.12, 0.2),
        new THREE.MeshStandardMaterial({
            color: 0xffffff
        })
    );

    decoration.position.y = 0.2;
    group.add(decoration);

    return group;
}

function createCosmeticShield(id) {
    const item = cosmetics.shields.find(
        value => value.id === id
    );

    const color = item ? item.color : "#168bff";

    const shield = new THREE.Mesh(
        new THREE.CylinderGeometry(
            0.48,
            0.48,
            0.12,
            6
        ),
        new THREE.MeshStandardMaterial({
            color,
            metalness: 0.4,
            roughness: 0.35
        })
    );

    shield.rotation.z = Math.PI / 2;
    shield.rotation.y = Math.PI / 2;

    return shield;
}

function updateAvatarAppearance() {
    if (!scene || !player) return;

    scene.remove(player);

    player = createAvatar(
        playerData.color,
        equipped
    );

    player.position.set(position.x, 0, position.z);
    player.rotation.y = rotation;

    scene.add(player);
}

// OTHER PLAYERS

function addOtherPlayer(data) {
    if (!data || !data.id) return;
    if (data.id === socket?.id) return;

    otherPlayers.set(data.id, data);

    if (!scene) return;

    let object = otherPlayers.get(data.id)?.object;

    if (!object) {
        object = createAvatar(
            data.color || "#ffbd4a",
            {
                weapons: "neon",
                shields: "blue",
                outfits: "default"
            }
        );

        otherPlayers.get(data.id).object = object;
        scene.add(object);
    }

    if (typeof data.x === "number") {
        object.position.x = data.x;
    }

    if (typeof data.z === "number") {
        object.position.z = data.z;
    }

    if (typeof data.rotation === "number") {
        object.rotation.y = data.rotation;
    }
}

function moveOtherPlayer(data) {
    if (!data || !data.id) return;

    addOtherPlayer(data);
}

function removeOtherPlayer(id) {
    const data = otherPlayers.get(id);

    if (data?.object && scene) {
        scene.remove(data.object);
    }

    otherPlayers.delete(id);
}

// CONTROLS

function setupKeyboard() {
    window.addEventListener("keydown", event => {
        keys[event.key.toLowerCase()] = true;
    });

    window.addEventListener("keyup", event => {
        keys[event.key.toLowerCase()] = false;
    });
}

function setupTouchControls() {
    const controls = document.createElement("div");
    controls.id = "touchControls";

    controls.innerHTML = `
        <div class="neo-pad">
            <button data-move="forward">▲</button>
            <div class="neo-pad-row">
                <button data-move="left">◀</button>
                <button data-move="backward">▼</button>
                <button data-move="right">▶</button>
            </div>
        </div>
    `;

    const style = document.createElement("style");

    style.textContent = `
        #touchControls {
            position: absolute;
            left: 12px;
            bottom: 22px;
            z-index: 30;
            touch-action: none;
        }

        .neo-pad {
            text-align: center;
        }

        .neo-pad button {
            width: 56px;
            height: 56px;
            margin: 3px;
            border-radius: 13px;
            border: 1px solid #00d9ff;
            color: white;
            background: rgba(8, 25, 50, 0.85);
            font-size: 22px;
            touch-action: none;
        }

        .neo-pad button:active {
            background: #087eb5;
        }
    `;

    document.head.appendChild(style);
    game.appendChild(controls);

    controls.querySelectorAll("button").forEach(button => {
        const direction = button.dataset.move;

        const release = event => {
            event.preventDefault();
            movement[direction] = false;
        };

        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            movement[direction] = true;
            button.setPointerCapture(event.pointerId);
        });

        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    });
}

const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

function updateMovement(delta) {
    if (!player) return;

    const forward =
        movement.forward ||
        keys.w ||
        keys.arrowup;

    const backward =
        movement.backward ||
        keys.s ||
        keys.arrowdown;

    const left =
        movement.left ||
        keys.a ||
        keys.arrowleft;

    const right =
        movement.right ||
        keys.d ||
        keys.arrowright;

    let dx = 0;
    let dz = 0;

    if (forward) dz -= 1;
    if (backward) dz += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    if (dx === 0 && dz === 0) return;

    const length = Math.sqrt(dx * dx + dz * dz);

    dx /= length;
    dz /= length;

    const speed = 8 * delta;

    position.x += dx * speed;
    position.z += dz * speed;

    position.x = THREE.MathUtils.clamp(position.x, -75, 75);
    position.z = THREE.MathUtils.clamp(position.z, -75, 75);

    // Veikėjas atsisuka judėjimo kryptimi
    rotation = Math.atan2(dx, dz);

    player.position.set(position.x, 0, position.z);
    player.rotation.y = rotation;

    sendPosition();
}

function sendPosition() {
    if (!socket?.connected) return;

    const now = Date.now();

    if (now - lastSend < 60) return;

    lastSend = now;

    socket.emit("playerMove", {
        x: position.x,
        z: position.z,
        rotation,
        username: playerData.username,
        color: playerData.color
    });
}

// CAMERA AND RENDER

function animate() {
    if (!running) return;

    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);

    updateMovement(delta);

    if (player && camera) {
        // Kamera priešais veikėją
        const targetCamera = new THREE.Vector3(
            player.position.x,
            player.position.y + 3,
            player.position.z + 8
        );

        camera.position.lerp(targetCamera, 0.09);

        camera.lookAt(
            player.position.x,
            player.position.y + 1.05,
            player.position.z
        );
    }

    renderer.render(scene, camera);
}

// GAME START / EXIT

function startGame() {
    if (running) return;

    $("menu").hidden = true;
    game.hidden = false;

    if (!scene) {
        createWorld();
        setupTouchControls();
    }

    connectServer();

    running = true;
    clock.start();

    animate();
}

function exitGame() {
    running = false;

    if (animationId) {
        cancelAnimationFrame(animationId);
    }

    game.hidden = true;
    $("menu").hidden = false;

    const controls = $("touchControls");

    if (controls) controls.remove();

    Object.keys(movement).forEach(key => {
        movement[key] = false;
    });

    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

// MENUS

function openPanel(panel) {
    const container = $("menuPanel");
    const title = $("panelTitle");
    const content = $("panelContent");

    if (!container || !title || !content) return;

    container.hidden = false;
    content.replaceChildren();

    const headings = {
        avatar: "PLAYER PROFILE",
        events: "EVENTS",
        season: "SEASON",
        equipment: "EQUIPMENT",
        settings: "SETTINGS",
        updates: "UPDATES"
    };

    title.textContent = headings[panel] || "MENU";

    if (panel === "equipment") {
        showEquipment(content);
    }

    else if (panel === "avatar") {
        showAvatar(content);
    }

    else if (panel === "events") {
        content.textContent =
            "Events will be announced here.";
    }

    else if (panel === "season") {
        content.textContent =
            "Season information will appear here.";
    }

    else if (panel === "settings") {
        content.textContent =
            "Use the screen arrows to move.";
    }

    else {
        content.textContent =
            "Neo Shooter 3D updates.";
    }
}

function showEquipment(content) {
    const categories = [
        ["weapons", "GUN SKINS"],
        ["shields", "SHIELD SKINS"],
        ["outfits", "OUTFITS"]
    ];

    categories.forEach(([category, label]) => {
        const heading = document.createElement("h3");
        heading.textContent = label;
        heading.style.margin = "12px 0";
        content.appendChild(heading);

        cosmetics[category].forEach(item => {
            const row = document.createElement("div");

            row.style.cssText = `
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:8px;
                margin:8px 0;
                padding:9px;
                border:1px solid #315b9d;
                border-radius:8px;
            `;

            const name = document.createElement("span");
            name.textContent = item.name;
            name.style.color = item.color;

            const button = document.createElement("button");

            const isEquipped = equipped[category] === item.id;

            button.textContent = isEquipped
                ? "EQUIPPED"
                : "EQUIP";

            button.disabled = isEquipped;

            button.onclick = () => {
                equipped[category] = item.id;
                saveEquipment();
                updateAvatarAppearance();
                openPanel("equipment");
            };

            row.append(name, button);
            content.appendChild(row);
        });
    });

    const reset = document.createElement("button");
    reset.textContent = "RESET EQUIPMENT";

    reset.onclick = () => {
        equipped = {
            weapons: "neon",
            shields: "blue",
            outfits: "default"
        };

        saveEquipment();
        updateAvatarAppearance();
        openPanel("equipment");
    };

    content.appendChild(reset);
}

function showAvatar(content) {
    const label = document.createElement("p");
    label.textContent = "Player name";
    content.appendChild(label);

    const input = document.createElement("input");
    input.id = "usernameInput";
    input.maxLength = 18;
    input.value = playerData.username;

    content.appendChild(input);

    const button = document.createElement("button");
    button.textContent = "SAVE NAME";

    button.onclick = () => {
        playerData.username =
            input.value.trim() || "Player";

        localStorage.setItem(
            "neoUsername",
            playerData.username
        );

        if ($("playerInfo")) {
            $("playerInfo").textContent =
                playerData.username;
        }

        sendPosition();
    };

    content.appendChild(button);

    const colorLabel = document.createElement("p");
    colorLabel.textContent = "Avatar color";
    colorLabel.style.marginTop = "12px";
    content.appendChild(colorLabel);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = playerData.color;

    content.appendChild(colorInput);

    const colorButton = document.createElement("button");
    colorButton.textContent = "SAVE COLOR";

    colorButton.onclick = () => {
        playerData.color = colorInput.value;

        localStorage.setItem(
            "neoColor",
            playerData.color
        );

        updateAvatarAppearance();
        sendPosition();
    };

    content.appendChild(colorButton);
}

// MENU EVENTS

document.querySelectorAll("[data-panel]").forEach(button => {
    button.addEventListener("click", () => {
        openPanel(button.dataset.panel);
    });
});

$("closePanel")?.addEventListener("click", () => {
    $("menuPanel").hidden = true;
});

$("playButton")?.addEventListener("click", startGame);
$("exitButton")?.addEventListener("click", exitGame);

// KEYBOARD

setupKeyboard();

function setupKeyboard() {
    window.addEventListener("keydown", event => {
        keys[event.key.toLowerCase()] = true;
    });

    window.addEventListener("keyup", event => {
        keys[event.key.toLowerCase()] = false;
    });
}

// SCREEN RESIZE

window.addEventListener("resize", () => {
    if (!camera || !renderer) return;

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
});

setStatus("Pasiruošę prisijungti prie žaidimo");