import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const $ = id => document.getElementById(id);

const menu = $("menu");
const game = $("game");
const playButton = $("playButton");
const exitButton = $("exitButton");
const statusText = $("serverStatus");

let socket = null;
let scene, camera, renderer, player;
let animationId = null;
let running = false;
let playerId = null;
let lastSend = 0;

const keys = {};
const otherPlayers = new Map();
const remotePlayers = new Map();

let playerData = {
    username: localStorage.getItem("neoUsername") || "Player",
    color: localStorage.getItem("neoColor") || "#00d9ff"
};

const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

let position = { x: 0, z: 0 };
let rotation = 0;

function connectServer() {
    if (socket?.connected) return;

    socket = window.io();

    socket.on("connect", () => {
        statusText.textContent = "Server connected";
    });

    socket.on("connect_error", () => {
        statusText.textContent = "Connection problem";
    });

    socket.on("disconnect", () => {
        statusText.textContent = "Disconnected from server";
    });

    socket.on("playersUpdate", players => {
        if (!Array.isArray(players)) return;

        players.forEach(data => {
            if (!data || data.id === socket.id) return;
            addOtherPlayer(data);
        });
    });

    socket.on("playerJoined", data => {
        if (data) addOtherPlayer(data);
    });

    socket.on("playerMoved", data => {
        if (data) moveOtherPlayer(data);
    });

    socket.on("playerLeft", id => {
        removeOtherPlayer(id);
    });

    socket.on("adminMessage", data => {
        const message = typeof data === "string" ? data : data?.message;
        if ($("adminAnnouncement") && message) {
            $("adminAnnouncement").textContent = message;
        }
    });

    socket.on("banned", () => {
        alert("Your connection was closed by an administrator.");
        exitGame();
    });
}

function createWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8bc7ed);
    scene.fog = new THREE.Fog(0x8bc7ed, 45, 150);

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.1,
        300
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    game.appendChild(renderer.domElement);

    const sunlight = new THREE.DirectionalLight(0xffffff, 2);
    sunlight.position.set(30, 50, 20);
    sunlight.castShadow = true;
    scene.add(sunlight);

    scene.add(new THREE.HemisphereLight(0xc5eaff, 0x334455, 1.5));

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 180),
        new THREE.MeshStandardMaterial({ color: 0x354b45 })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    createRoads();
    createBuildings();
    createPlayer();

    camera.position.set(0, 5, 9);
    camera.lookAt(player.position);

    renderExistingPlayers();
}

function createRoads() {
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x303946
    });

    for (let i = -3; i <= 3; i++) {
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(180, 0.08, 7),
            roadMaterial
        );

        road.position.set(0, 0.04, i * 24);
        scene.add(road);

        const crossRoad = new THREE.Mesh(
            new THREE.BoxGeometry(7, 0.08, 180),
            roadMaterial
        );

        crossRoad.position.set(i * 24, 0.05, 0);
        scene.add(crossRoad);
    }
}

function createBuildings() {
    const colors = [0x536c8a, 0x64748b, 0x43556e, 0x718096];

    for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) {
            if (Math.abs(x) <= 1 && Math.abs(z) <= 1) continue;

            const height = 5 + Math.random() * 15;
            const width = 5 + Math.random() * 3;

            const building = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, width),
                new THREE.MeshStandardMaterial({
                    color: colors[Math.floor(Math.random() * colors.length)]
                })
            );

            building.position.set(
                x * 18 + (Math.random() - 0.5) * 3,
                height / 2,
                z * 18 + (Math.random() - 0.5) * 3
            );

            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);

            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(width + 0.2, 0.3, width + 0.2),
                new THREE.MeshStandardMaterial({ color: 0x26364b })
            );

            roof.position.set(
                building.position.x,
                height + 0.15,
                building.position.z
            );

            scene.add(roof);
        }
    }
}

function createAvatar(color) {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({ color });

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1, 4, 8),
        material
    );

    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffd2ad })
    );

    head.position.y = 2.05;
    group.add(head);

    return group;
}

function createPlayer() {
    player = createAvatar(playerData.color);
    player.position.set(position.x, 0, position.z);
    scene.add(player);
}

function addOtherPlayer(data) {
    if (!scene || !data.id || data.id === socket?.id) return;

    let object = otherPlayers.get(data.id);

    if (!object) {
        object = createAvatar(data.color || "#ffbd4a");
        scene.add(object);
        otherPlayers.set(data.id, object);
    }

    if (typeof data.x === "number") object.position.x = data.x;
    if (typeof data.z === "number") object.position.z = data.z;
    if (typeof data.rotation === "number") object.rotation.y = data.rotation;
}

function moveOtherPlayer(data) {
    if (!data.id || data.id === socket?.id) return;

    addOtherPlayer(data);
}

function removeOtherPlayer(id) {
    const object = otherPlayers.get(id);

    if (object && scene) {
        scene.remove(object);
    }

    otherPlayers.delete(id);
}

function renderExistingPlayers() {
    otherPlayers.forEach(object => scene.add(object));
}

function sendPosition() {
    if (!socket?.connected) return;

    const now = Date.now();
    if (now - lastSend < 60) return;
    lastSend = now;

    socket.emit("playerMove", {
        x: position.x,
        z: position.z,
        rotation
    });
}

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
        <div class="touch-pad">
            <button data-move="forward">▲</button>
            <div>
                <button data-move="left">◀</button>
                <button data-move="backward">▼</button>
                <button data-move="right">▶</button>
            </div>
        </div>
    `;

    Object.assign(controls.style, {
        position: "absolute",
        bottom: "25px",
        left: "18px",
        zIndex: "20",
        touchAction: "none"
    });

    const style = document.createElement("style");
    style.textContent = `
        .touch-pad button {
            width: 55px;
            height: 55px;
            margin: 4px;
            font-size: 22px;
            background: rgba(10, 35, 65, 0.8);
            border: 1px solid #00d9ff;
            color: white;
            border-radius: 12px;
            touch-action: none;
        }
        .touch-pad { text-align: center; }
        #touchControls button:active { background: #087eb5; }
    `;

    document.head.appendChild(style);
    game.appendChild(controls);

    controls.querySelectorAll("button").forEach(button => {
        const direction = button.dataset.move;

        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            movement[direction] = true;
            button.setPointerCapture(event.pointerId);
        });

        const release = event => {
            event.preventDefault();
            movement[direction] = false;
        };

        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    });
}

function updateMovement(delta) {
    if (!player) return;

    const forward =
        movement.forward || keys["w"] || keys["arrowup"];

    const backward =
        movement.backward || keys["s"] || keys["arrowdown"];

    const left =
        movement.left || keys["a"] || keys["arrowleft"];

    const right =
        movement.right || keys["d"] || keys["arrowright"];

    let dx = 0;
    let dz = 0;

    if (forward) dz -= 1;
    if (backward) dz += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    if (dx !== 0 || dz !== 0) {
        const length = Math.sqrt(dx * dx + dz * dz);
        dx /= length;
        dz /= length;

        const speed = 8 * delta;

        position.x += dx * speed;
        position.z += dz * speed;

        position.x = THREE.MathUtils.clamp(position.x, -75, 75);
        position.z = THREE.MathUtils.clamp(position.z, -75, 75);

        rotation = Math.atan2(dx, dz);
        player.rotation.y = rotation;
        player.position.set(position.x, 0, position.z);

        sendPosition();
    }
}

function animate() {
    if (!running) return;

    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);

    updateMovement(delta);

    if (player && camera) {
        const target = new THREE.Vector3(
            player.position.x,
            player.position.y + 3,
            player.position.z + 7
        );

        camera.position.lerp(target, 0.08);
        camera.lookAt(
            player.position.x,
            player.position.y + 1.2,
            player.position.z
        );
    }

    renderer.render(scene, camera);
}

const clock = new THREE.Clock();

function startGame() {
    menu.hidden = true;
    game.hidden = false;

    if (!scene) {
        createWorld();
        setupTouchControls();
    }

    connectServer();

    if (socket?.connected) {
        socket.emit("playerMove", {
            x: position.x,
            z: position.z,
            rotation
        });
    }

    running = true;
    clock.start();
    animate();
}

function exitGame() {
    running = false;

    if (animationId) cancelAnimationFrame(animationId);

    game.hidden = true;
    menu.hidden = false;

    const controls = $("touchControls");
    if (controls) controls.remove();

    if (socket?.connected) {
        socket.disconnect();
    }

    socket = null;
}

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
        equipment: "STYLE",
        settings: "SETTINGS",
        updates: "UPDATES"
    };

    title.textContent = headings[panel] || "MENU";

    if (panel === "avatar") {
        content.innerHTML = `
            <p>Player name</p>
            <input id="usernameInput" maxlength="18">
            <button id="saveName">SAVE NAME</button>
        `;

        $("usernameInput").value = playerData.username;

        $("saveName").onclick = () => {
            playerData.username = $("usernameInput").value.trim() || "Player";
            localStorage.setItem("neoUsername", playerData.username);
            if ($("playerInfo")) $("playerInfo").textContent = playerData.username;
        };
    } else if (panel === "equipment") {
        content.innerHTML = `
            <p>Choose avatar color</p>
            <input id="avatarColor" type="color">
            <button id="saveColor">SAVE COLOR</button>
        `;

        $("avatarColor").value = playerData.color;

        $("saveColor").onclick = () => {
            playerData.color = $("avatarColor").value;
            localStorage.setItem("neoColor", playerData.color);
            if (player && scene) {
                scene.remove(player);
                createPlayer();
            }
        };
    } else if (panel === "events") {
        content.textContent = "Events will be announced here.";
    } else if (panel === "season") {
        content.textContent = "Season information will appear here.";
    } else if (panel === "settings") {
        content.textContent = "Use the on-screen arrows to move on your phone.";
    } else {
        content.textContent = "Neo Shooter 3D updates will appear here.";
    }
}

document.querySelectorAll("[data-panel]").forEach(button => {
    button.addEventListener("click", () => {
        openPanel(button.dataset.panel);
    });
});

$("closePanel")?.addEventListener("click", () => {
    $("menuPanel").hidden = true;
});

playButton?.addEventListener("click", startGame);
exitButton?.addEventListener("click", exitGame);

setupKeyboard();

window.addEventListener("resize", () => {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

if (statusText) {
    statusText.textContent = "Ready to connect";
}