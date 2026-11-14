import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const container = document.getElementById("game");

if (!container) {
    throw new Error("Nerastas #game elementas index.html faile");
}

container.innerHTML = "";
container.style.width = "100%";
container.style.height = "70vh";
container.style.minHeight = "400px";
container.style.position = "relative";
container.style.overflow = "hidden";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101b32);

const camera = new THREE.PerspectiveCamera(
    70,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Apšvietimas
scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 2));

const sunlight = new THREE.DirectionalLight(0xffffff, 2);
sunlight.position.set(5, 10, 5);
scene.add(sunlight);

// Žemėlapis
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x263b50 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Tinklelis
const grid = new THREE.GridHelper(100, 50, 0x00eaff, 0x456078);
scene.add(grid);

// Žaidėjo personažas
const player = new THREE.Group();

const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x00eaff })
);
body.position.y = 1;
player.add(body);

const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffcc99 })
);
head.position.y = 2;
player.add(head);

scene.add(player);

// Kameros padėtis
camera.position.set(0, 5, 8);
camera.lookAt(player.position);

// Judėjimas
const keys = {};

window.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", e => {
    keys[e.key.toLowerCase()] = false;
});

// Mobilūs valdikliai
const controls = document.createElement("div");
controls.style.cssText =
    "position:absolute;bottom:15px;left:15px;display:grid;grid-template-columns:55px 55px 55px;gap:5px;z-index:5;";

const buttons = {};

[
    ["up", "▲", 1, 2],
    ["left", "◀", 2, 1],
    ["down", "▼", 2, 2],
    ["right", "▶", 2, 3]
].forEach(([name, symbol, row, col]) => {
    const button = document.createElement("button");
    button.textContent = symbol;
    button.style.cssText =
        "width:55px;height:55px;background:#12334a;color:#00eaff;border:2px solid #00eaff;border-radius:12px;font-size:22px;";

    button.style.gridRow = row;
    button.style.gridColumn = col;

    button.addEventListener("pointerdown", e => {
        e.preventDefault();
        buttons[name] = true;
    });

    ["pointerup", "pointerleave", "pointercancel"].forEach(event => {
        button.addEventListener(event, () => buttons[name] = false);
    });

    controls.appendChild(button);
});

container.appendChild(controls);

function animate() {
    requestAnimationFrame(animate);

    const speed = 0.09;

    if (keys["w"] || keys["arrowup"] || buttons.up) player.position.z -= speed;
    if (keys["s"] || keys["arrowdown"] || buttons.down) player.position.z += speed;
    if (keys["a"] || keys["arrowleft"] || buttons.left) player.position.x -= speed;
    if (keys["d"] || keys["arrowright"] || buttons.right) player.position.x += speed;

    player.position.x = THREE.MathUtils.clamp(player.position.x, -45, 45);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -45, 45);

    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 8;
    camera.position.y = 5;
    camera.lookAt(player.position.x, player.position.y + 0.5, player.position.z);

    renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
});

animate();