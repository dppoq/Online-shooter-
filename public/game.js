import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const container = document.getElementById("game");

if (!container) {
    throw new Error("Nerastas #game elementas");
}

let started = false;
let scene, camera, renderer, player;
let animationId;
let socket = null;

const keys = {};
const remotePlayers = new Map();

let controlMode = localStorage.getItem("neoControlMode") || "auto";
let avatarColor = localStorage.getItem("neoAvatarColor") || "#00eaff";
let cameraAngle = 0;
let cameraDistance = 8;

const moveButtons = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false
};

const cosmetics = {
    outfit: "Neon Blue",
    equipment: "Standard"
};

function makeButton(text, callback) {
    const button = document.createElement("button");
    button.textContent = text;

    button.style.cssText = `
        background:#102b42;
        color:#00eaff;
        border:1px solid #00eaff;
        border-radius:9px;
        padding:11px 15px;
        margin:4px;
        font-weight:bold;
        cursor:pointer;
    `;

    button.addEventListener("click", callback);
    return button;
}

function createPanel() {
    const panel = document.createElement("div");

    panel.style.cssText = `
        position:absolute;
        top:65px;
        left:50%;
        transform:translateX(-50%);
        width:min(92%,450px);
        max-height:65%;
        overflow:auto;
        background:rgba(5,15,30,.96);
        border:2px solid #00eaff;
        border-radius:14px;
        padding:15px;
        z-index:20;
        color:white;
        display:none;
        text-align:center;
    `;

    container.appendChild(panel);
    return panel;
}

function createMenu() {
    const menu = document.createElement("div");

    menu.style.cssText = `
        position:absolute;
        top:8px;
        left:0;
        right:0;
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:3px;
        z-index:10;
    `;

    container.appendChild(menu);

    const panel = createPanel();

    const pages = {
        AVATAR() {
            panel.innerHTML = `
                <h2>AVATAR</h2>
                <p>Pasirink personažo spalvą</p>
            `;

            ["#00eaff", "#ff4d9d", "#aaff00", "#ffb000", "#ffffff"].forEach(color => {
                const button = makeButton("●", () => {
                    avatarColor = color;
                    localStorage.setItem("neoAvatarColor", color);
                    updateAvatar();
                });

                button.style.color = color;
                button.style.fontSize = "25px";
                panel.appendChild(button);
            });

            const outfits = document.createElement("p");
            outfits.textContent = "Apranga: Neon Blue";
            panel.appendChild(outfits);

            panel.appendChild(makeButton("CLOSE", closePanel));
        },

        EVENTS() {
            panel.innerHTML = `
                <h2>EVENTS</h2>
                <h3>Welcome Event</h3>
                <p>Susipažink su Neo Shooter 3D arena.</p>
                <p>Statusas: aktyvus demonstracinis renginys</p>
                <h3>City Explorer</h3>
                <p>Apžiūrėk miesto žemėlapį.</p>
            `;

            panel.appendChild(makeButton("CLOSE", closePanel));
        },

        SETTINGS() {
            panel.innerHTML = `
                <h2>SETTINGS</h2>
                <p>Valdymo pasirinkimas</p>
            `;

            const select = document.createElement("select");

            select.style.cssText = `
                padding:12px;
                background:#102b42;
                color:white;
                border:1px solid #00eaff;
                border-radius:8px;
            `;

            [
                ["auto", "AUTO"],
                ["mobile", "WEB - TELEFONAS"],
                ["computer", "WEB - KOMPIUTERIS"]
            ].forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                select.appendChild(option);
            });

            select.value = controlMode;

            select.addEventListener("change", () => {
                controlMode = select.value;
                localStorage.setItem("neoControlMode", controlMode);
                updateControls();
            });

            panel.appendChild(select);

            panel.innerHTML += `
                <p>Grafika: High</p>
                <p>Garso nustatymai: bus papildyti vėliau</p>
            `;

            panel.appendChild(makeButton("CLOSE", closePanel));
        },

        UPDATES() {
            panel.innerHTML = `
                <h2>UPDATES</h2>
                <h3>Neo Shooter 3D</h3>
                <p>Pradinis 3D miesto prototipas.</p>
                <p>Naujos funkcijos kuriamos.</p>
            `;

            panel.appendChild(makeButton("CLOSE", closePanel));
        },

        SEASON() {
            panel.innerHTML = `
                <h2>SEASON 1</h2>
                <p>Season Pass – demonstracinė versija</p>
                <p>Season Level: 1</p>
                <p>XP: 0 / 100</p>
                <p>Rewards: būsimi apdovanojimai</p>
                <p>Missions: apžiūrėk miesto areną</p>
            `;

            panel.appendChild(makeButton("MISSIONS", () => {
                panel.innerHTML = `
                    <h2>MISSIONS</h2>
                    <p>Apžiūrėk miesto žemėlapį.</p>
                    <p>Apdovanojimas: 100 XP (demonstracija)</p>
                `;
                panel.appendChild(makeButton("BACK", pages.SEASON));
            }));

            panel.appendChild(makeButton("CLOSE", closePanel));
        },

        WEAPONS() {
            panel.innerHTML = `
                <h2>EQUIPMENT</h2>
                <p>Pasirink dekoratyvinį įrangos stilių.</p>
            `;

            ["Standard", "Neon", "Gold", "Cyber"].forEach(name => {
                panel.appendChild(makeButton(name, () => {
                    cosmetics.equipment = name;
                    alert("Pasirinktas stilius: " + name);
                }));
            });

            panel.appendChild(makeButton("CLOSE", closePanel));
        }
    };

    Object.entries(pages).forEach(([name, action]) => {
        menu.appendChild(makeButton(name, () => {
            panel.innerHTML = "";
            panel.style.display = "block";
            action();
        }));
    });

    function closePanel() {
        panel.style.display = "none";
    }

    return { menu, panel };
}

function updateAvatar() {
    if (!player) return;

    player.traverse(object => {
        if (object.isMesh && object.userData.avatarBody) {
            object.material.color.set(avatarColor);
        }
    });
}

function createPlayer() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.2, 0.45),
        new THREE.MeshStandardMaterial({ color: avatarColor })
    );

    body.position.y = 1;
    body.userData.avatarBody = true;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xffcc99 })
    );

    head.position.y = 1.85;
    group.add(head);

    const legs = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.65, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x17243b })
    );

    legs.position.y = 0.35;
    group.add(legs);

    return group;
}

function createCity() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
        new THREE.MeshStandardMaterial({ color: 0x263746 })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    scene.add(ground);

    // Gatvės
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x151d2b
    });

    const road1 = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 12),
        roadMaterial
    );

    road1.rotation.x = -Math.PI / 2;
    road1.position.y = 0;
    scene.add(road1);

    const road2 = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 120),
        roadMaterial
    );

    road2.rotation.x = -Math.PI / 2;
    road2.position.y = 0.01;
    scene.add(road2);

    // Gatvių linijos
    const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0x00eaff
    });

    for (let i = -50; i <= 50; i += 5) {
        const line = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.025, 0.12),
            lineMaterial
        );

        line.position.set(i, 0.03, 0);
        scene.add(line);
    }

    // Pastatai
    const buildingColors = [
        0x18334c,
        0x203e5a,
        0x252e4c,
        0x183d42
    ];

    for (let x = -45; x <= 45; x += 15) {
        for (let z = -45; z <= 45; z += 15) {
            if (Math.abs(x) < 10 || Math.abs(z) < 10) continue;

            const height = 5 + Math.random() * 12;

            const building = new THREE.Mesh(
                new THREE.BoxGeometry(8, height, 8),
                new THREE.MeshStandardMaterial({
                    color: buildingColors[
                        Math.floor(Math.random() * buildingColors.length)
                    ]
                })
            );

            building.position.set(x, height / 2, z);
            scene.add(building);

            // Neon langai
            const windowMesh = new THREE.Mesh(
                new THREE.BoxGeometry(8.1, 0.12, 8.1),
                new THREE.MeshBasicMaterial({
                    color: 0x00aacc,
                    wireframe: true
                })
            );

            windowMesh.position.copy(building.position);
            scene.add(windowMesh);
        }
    }

    // Dekoratyvinės šviesos
    for (let i = -40; i <= 40; i += 20) {
        const light = new THREE.PointLight(0x00dfff, 35, 18);
        light.position.set(i, 5, 5);
        scene.add(light);
    }
}

function createRemotePlayer(data) {
    if (!data || !data.id || data.id === socket?.id) return;

    if (remotePlayers.has(data.id)) return;

    const model = createPlayer();
    model.scale.setScalar(0.9);

    scene.add(model);
    remotePlayers.set(data.id, model);

    if (data.position) {
        model.position.set(
            data.position.x || 0,
            0,
            data.position.z || 0
        );
    }
}

function setupMultiplayer() {
    if (!socket) return;

    socket.on("playersUpdate", list => {
        if (!Array.isArray(list)) return;

        list.forEach(data => createRemotePlayer(data));

        const ids = new Set(list.map(p => p.id));

        for (const [id, model] of remotePlayers) {
            if (!ids.has(id)) {
                scene.remove(model);
                remotePlayers.delete(id);
            }
        }
    });

    socket.on("playerJoined", createRemotePlayer);

    socket.on("playerMoved", data => {
        const model = remotePlayers.get(data.id);
        if (!model) return;

        if (data.position) {
            model.position.x = data.position.x;
            model.position.z = data.position.z;
        }

        if (Number.isFinite(data.rotation)) {
            model.rotation.y = data.rotation;
        }
    });

    socket.on("playerLeft", data => {
        const model = remotePlayers.get(data.id);
        if (model) {
            scene.remove(model);
            remotePlayers.delete(data.id);
        }
    });
}

function sendPlayerPosition() {
    if (!socket || !socket.connected || !player) return;

    socket.emit("playerMove", {
        x: player.position.x,
        z: player.position.z,
        rotation: player.rotation.y
    });
}

function createMobileControls() {
    const controls = document.createElement("div");

    controls.style.cssText = `
        position:absolute;
        bottom:15px;
        left:10px;
        display:grid;
        grid-template-columns:55px 55px 55px;
        gap:5px;
        z-index:8;
    `;

    const items = [
        ["up", "▲", 1, 2],
        ["left", "◀", 2, 1],
        ["down", "▼", 2, 2],
        ["right", "▶", 2, 3]
    ];

    items.forEach(([name, symbol, row, col]) => {
        const button = makeButton(symbol, () => {});
        button.style.cssText += `
            width:55px;
            height:55px;
            padding:0;
            font-size:22px;
            touch-action:none;
        `;

        button.style.gridRow = row;
        button.style.gridColumn = col;

        button.addEventListener("pointerdown", e => {
            e.preventDefault();
            moveButtons[name] = true;
            button.setPointerCapture(e.pointerId);
        });

        ["pointerup", "pointercancel", "lostpointercapture"].forEach(event => {
            button.addEventListener(event, () => {
                moveButtons[name] = false;
            });
        });

        controls.appendChild(button);
    });

    const jump = makeButton("JUMP", () => {
        moveButtons.jump = true;
        setTimeout(() => moveButtons.jump = false, 150);
    });

    jump.style.position = "absolute";
    jump.style.right = "15px";
    jump.style.bottom = "25px";
    jump.style.zIndex = "8";

    container.appendChild(controls);
    container.appendChild(jump);

    return { controls, jump };
}

function updateControls() {
    const mobile = controlMode === "mobile" ||
        (controlMode === "auto" &&
        /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

    if (mobileControls) {
        mobileControls.controls.style.display = mobile ? "grid" : "none";
        mobileControls.jump.style.display = mobile ? "block" : "none";
    }
}

let mobileControls;

function initializeGame() {
    if (started || container.clientWidth === 0) return;

    started = true;

    container.style.position = "relative";
    container.style.overflow = "hidden";

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101b32);

    camera = new THREE.PerspectiveCamera(
        70,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);

    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.zIndex = "1";

    container.prepend(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 2));

    const sunlight = new THREE.DirectionalLight(0xffffff, 2);
    sunlight.position.set(5, 15, 5);
    scene.add(sunlight);

    createCity();

    player = createPlayer();
    scene.add(player);

    camera.position.set(0, 5, 8);
    camera.lookAt(player.position);

    createMenu();
    mobileControls = createMobileControls();
    updateControls();

    window.addEventListener("keydown", e => {
        keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener("keyup", e => {
        keys[e.key.toLowerCase()] = false;
    });

    setupMultiplayer();

    animate();
}

function animate() {
    animationId = requestAnimationFrame(animate);

    if (!player || !renderer) return;

    const speed = 0.12;

    let dx = 0;
    let dz = 0;

    if (keys["w"] || keys["arrowup"] || moveButtons.up) dz -= 1;
    if (keys["s"] || keys["arrowdown"] || moveButtons.down) dz += 1;
    if (keys["a"] || keys["arrowleft"] || moveButtons.left) dx -= 1;
    if (keys["d"] || keys["arrowright"] || moveButtons.right) dx += 1;

    const length = Math.hypot(dx, dz);

    if (length > 0) {
        dx /= length;
        dz /= length;

        player.position.x += dx * speed;
        player.position.z += dz * speed;

        player.rotation.y = Math.atan2(dx, dz);
    }

    player.position.x = THREE.MathUtils.clamp(
        player.position.x, -55, 55
    );

    player.position.z = THREE.MathUtils.clamp(
        player.position.z, -55, 55
    );

    camera.position.x = player.position.x + Math.sin(cameraAngle) * cameraDistance;
    camera.position.z = player.position.z + Math.cos(cameraAngle) * cameraDistance;
    camera.position.y = 5;

    camera.lookAt(
        player.position.x,
        player.position.y + 0.8,
        player.position.z
    );

    sendPlayerPosition();

    renderer.render(scene, camera);
}

function resizeGame() {
    if (!renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

const observer = new MutationObserver(() => {
    if (container.style.display !== "none") {
        initializeGame();
        resizeGame();
    }
});

observer.observe(container, {
    attributes: true,
    attributeFilter: ["style", "class"]
});

window.addEventListener("resize", () => {
    initializeGame();
    resizeGame();
});

// Jeigu žaidimas jau matomas
if (container.style.display !== "none") {
    initializeGame();
}

window.addEventListener("beforeunload", () => {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) renderer.dispose();
});