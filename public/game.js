import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

// NEO SHOOTER 3D

const menu = document.getElementById("menu");
const game = document.getElementById("game");
const playButton = document.getElementById("playButton");
const exitButton = document.getElementById("exitButton");
const statusText = document.getElementById("serverStatus");
const panel = document.getElementById("menuPanel");
const panelTitle = document.getElementById("panelTitle");
const panelContent = document.getElementById("panelContent");

let scene;
let camera;
let renderer;
let player;
let socket;
let animationStarted = false;

const otherPlayers = new Map();
const keys = {};

let playerName = localStorage.getItem("neoName") || "Player";
let avatarColor = localStorage.getItem("neoColor") || "#00ccff";

const clock = new THREE.Clock();

// SERVER CONNECTION
function connectServer() {
    if (socket && socket.connected) return;

    socket = window.io();

    socket.on("connect", () => {
        statusText.textContent = "Server: ONLINE";
    });

    socket.on("disconnect", () => {
        statusText.textContent = "Server: OFFLINE";
    });

    socket.on("connect_error", () => {
        statusText.textContent = "Server: CONNECTION ERROR";
    });

    socket.on("serverUnavailable", () => {
        alert("Serveris šiuo metu nepasiekiamas.");
    });

    socket.on("adminMessage", data => {
        document.getElementById("adminAnnouncement").textContent =
            data.message || "";
    });

    socket.on("playersUpdate", list => {
        if (!Array.isArray(list)) return;

        list.forEach(data => {
            if (data.id === socket.id) return;
            createOtherPlayer(data);
        });

        for (const [id] of otherPlayers) {
            if (!list.some(item => item.id === id)) {
                removeOtherPlayer(id);
            }
        }

        document.getElementById("onlinePlayers").textContent =
            "Online: " + list.length;
    });

    socket.on("playerJoined", data => {
        createOtherPlayer(data);
    });

    socket.on("playerMoved", data => {
        const other = otherPlayers.get(data.id);
        if (!other) return;

        other.position.set(
            data.position.x,
            0,
            data.position.z
        );

        other.rotation.y = data.rotation;
    });

    socket.on("playerLeft", data => {
        removeOtherPlayer(data.id);
    });

    socket.on("banned", data => {
        alert(data.message || "Prieiga užblokuota.");
        exitGame();
    });
}

// 3D WORLD
function createWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101a35);
    scene.fog = new THREE.Fog(0x101a35, 35, 110);

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.1,
        200
    );

    camera.position.set(0, 5, 9);

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(window.innerWidth, window.innerHeight);

    game.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(
        0xb9d9ff,
        0x202040,
        2
    );

    scene.add(ambient);

    const sunlight = new THREE.DirectionalLight(
        0xffffff,
        2
    );

    sunlight.position.set(10, 20, 10);
    scene.add(sunlight);

    // GROUND
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({
            color: 0x26344b
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    // CITY ROADS
    for (let i = -40; i <= 40; i += 10) {
        const road = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.04, 100),
            new THREE.MeshStandardMaterial({
                color: 0x172338
            })
        );

        road.position.set(i, 0.01, 0);
        scene.add(road);

        const crossRoad = new THREE.Mesh(
            new THREE.BoxGeometry(100, 0.04, 2),
            new THREE.MeshStandardMaterial({
                color: 0x172338
            })
        );

        crossRoad.position.set(0, 0.02, i);
        scene.add(crossRoad);
    }

    // BUILDINGS
    for (let x = -40; x <= 40; x += 10) {
        for (let z = -40; z <= 40; z += 10) {
            if (Math.abs(x) < 8 || Math.abs(z) < 8) {
                continue;
            }

            const height = 4 + Math.random() * 12;

            const building = new THREE.Mesh(
                new THREE.BoxGeometry(
                    5,
                    height,
                    5
                ),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setHSL(
                        0.58 + Math.random() * 0.12,
                        0.35,
                        0.2 + Math.random() * 0.15
                    )
                })
            );

            building.position.set(
                x,
                height / 2,
                z
            );

            scene.add(building);

            const light = new THREE.PointLight(
                0x00bbff,
                1,
                8
            );

            light.position.set(x, height - 1, z + 2);
            scene.add(light);
        }
    }

    createPlayer();

    window.addEventListener("resize", resizeGame);

    animationStarted = true;
    animate();
}

// PLAYER AVATAR
function createPlayer() {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
        color: avatarColor
    });

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, 0.8, 4, 8),
        material
    );

    body.position.y = 1.1;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 20, 20),
        new THREE.MeshStandardMaterial({
            color: 0xffd4b0
        })
    );

    head.position.y = 1.95;
    group.add(head);

    group.position.set(0, 0, 0);

    scene.add(group);
    player = group;
}

// OTHER PLAYERS
function createOtherPlayer(data) {
    if (!scene || !data || !data.id) return;
    if (data.id === socket.id) return;

    if (otherPlayers.has(data.id)) return;

    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, 0.8, 4, 8),
        new THREE.MeshStandardMaterial({
            color: 0xffaa44
        })
    );

    body.position.y = 1.1;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0xffd4b0
        })
    );

    head.position.y = 1.95;
    group.add(head);

    if (data.position) {
        group.position.set(
            data.position.x,
            0,
            data.position.z
        );
    }

    group.rotation.y = data.rotation || 0;

    scene.add(group);
    otherPlayers.set(data.id, group);
}

function removeOtherPlayer(id) {
    const other = otherPlayers.get(id);

    if (!other) return;

    scene.remove(other);
    otherPlayers.delete(id);
}

// MOVEMENT
function setupControls() {
    window.addEventListener("keydown", event => {
        keys[event.key.toLowerCase()] = true;
    });

    window.addEventListener("keyup", event => {
        keys[event.key.toLowerCase()] = false;
    });
}

function movePlayer(delta) {
    if (!player) return;

    const speed = 7 * delta;

    let moved = false;

    if (keys["w"] || keys["arrowup"]) {
        player.position.z -= speed;
        moved = true;
    }

    if (keys["s"] || keys["arrowdown"]) {
        player.position.z += speed;
        moved = true;
    }

    if (keys["a"] || keys["arrowleft"]) {
        player.position.x -= speed;
        moved = true;
    }

    if (keys["d"] || keys["arrowright"]) {
        player.position.x += speed;
        moved = true;
    }

    player.position.x = THREE.MathUtils.clamp(
        player.position.x,
        -45,
        45
    );

    player.position.z = THREE.MathUtils.clamp(
        player.position.z,
        -45,
        45
    );

    if (moved && socket && socket.connected) {
        socket.emit("playerMove", {
            x: player.position.x,
            z: player.position.z,
            rotation: player.rotation.y
        });
    }
}

// CAMERA
function updateCamera() {
    if (!player || !camera) return;

    const target = new THREE.Vector3(
        player.position.x,
        player.position.y + 2,
        player.position.z + 6
    );

    camera.position.lerp(target, 0.08);

    camera.lookAt(
        player.position.x,
        player.position.y + 1,
        player.position.z
    );
}

// GAME LOOP
function animate() {
    if (!animationStarted) return;

    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);

    movePlayer(delta);
    updateCamera();

    renderer.render(scene, camera);
}

// RESIZE
function resizeGame() {
    if (!camera || !renderer) return;

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}

// START GAME
function startGame() {
    menu.hidden = true;
    game.hidden = false;

    connectServer();

    if (!scene) {
        createWorld();
        setupControls();
    }
}

// EXIT GAME
function exitGame() {
    animationStarted = false;

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    game.hidden = true;
    menu.hidden = false;
}

// MENU PANELS
document.querySelectorAll("[data-panel]").forEach(button => {
    button.addEventListener("click", () => {
        const type = button.dataset.panel;

        panel.hidden = false;
        panelTitle.textContent = type.toUpperCase();

        if (type === "avatar") {
            panelContent.innerHTML = `
                <p>Player name:</p>
                <input id="nameInput" maxlength="16"
                    value="${playerName.replace(/["&<>]/g, "")}">
                <p>Avatar color:</p>
                <input id="colorInput" type="color"
                    value="${avatarColor}">
                <button id="saveAvatar">SAVE</button>
            `;

            document.getElementById("saveAvatar")
                .addEventListener("click", () => {
                    playerName = document.getElementById("nameInput")
                        .value.trim().slice(0, 16) || "Player";

                    avatarColor = document.getElementById("colorInput")
                        .value;

                    localStorage.setItem("neoName", playerName);
                    localStorage.setItem("neoColor", avatarColor);

                    if (player) {
                        player.children[0].material.color.set(avatarColor);
                    }

                    document.getElementById("playerInfo").textContent =
                        playerName;

                    panelContent.innerHTML =
                        "<p>Avatar saved!</p>";
                });
        }

        if (type === "events") {
            panelContent.innerHTML = `
                <p>NEO CITY EXPLORATION</p>
                <p>Explore the city and discover new places.</p>
                <p>More events coming soon!</p>
            `;
        }

        if (type === "season") {
            panelContent.innerHTML = `
                <p>SEASON 1</p>
                <p>Explore the world to earn experience.</p>
                <p>Season rewards coming soon!</p>
            `;
        }

        if (type === "equipment") {
            panelContent.innerHTML = `
                <p>AVATAR STYLE</p>
                <p>Customize your character's appearance.</p>
                <p>More cosmetic items coming soon!</p>
            `;
        }

        if (type === "settings") {
            panelContent.innerHTML = `
                <p>GRAPHICS</p>
                <select id="qualitySelect">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
                <p>Controls: W A S D or arrow keys</p>
            `;
        }

        if (type === "updates") {
            panelContent.innerHTML = `
                <p>NEO SHOOTER 3D</p>
                <p>Version 2.0</p>
                <p>3D city, avatars and online multiplayer.</p>
            `;
        }
    });
});

document.getElementById("closePanel").addEventListener(
    "click",
    () => {
        panel.hidden = true;
    }
);

playButton.addEventListener("click", startGame);
exitButton.addEventListener("click", exitGame);

// INITIALIZE
setupControls();
connectServer();

document.getElementById("playerInfo").textContent = playerName;