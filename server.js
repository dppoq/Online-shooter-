
require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("Nustatyk ADMIN_USERNAME ir ADMIN_PASSWORD");
}

const players = new Map();
const tokens = new Map();

let settings = {
    serverName: "Neo Shooter 3D",
    maxPlayers: 20,
    maintenance: false
};

let announcement = "";

function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    const expiry = tokens.get(token);

    if (!expiry || expiry < Date.now()) {
        tokens.delete(token);
        return res.status(401).json({
            error: "Reikia administratoriaus prisijungimo"
        });
    }

    next();
}

function publicPlayers() {
    return Array.from(players.values()).map(player => ({
        id: player.id,
        username: player.username,
        position: { ...player.position },
        rotation: player.rotation
    }));
}

// ADMIN LOGIN
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body || {};

    if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        username !== ADMIN_USERNAME ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            error: "Neteisingi prisijungimo duomenys"
        });
    }

    const token = crypto.randomBytes(32).toString("hex");
    tokens.set(token, Date.now() + 60 * 60 * 1000);

    res.json({
        success: true,
        token,
        expiresIn: 3600
    });
});

// SERVER STATUS
app.get("/api/status", (req, res) => {
    res.json({
        online: players.size,
        settings
    });
});

// PLAYER LIST
app.get("/api/players", requireAdmin, (req, res) => {
    res.json(publicPlayers());
});

// ADMIN MESSAGE
app.post("/api/admin/message", requireAdmin, (req, res) => {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Įrašyk žinutę" });
    }

    announcement = message.trim().slice(0, 300);

    io.emit("adminMessage", { message: announcement });

    res.json({ success: true });
});

// SERVER SETTINGS
app.post("/api/admin/settings", requireAdmin, (req, res) => {
    const { serverName, maxPlayers, maintenance } = req.body || {};

    if (typeof serverName === "string" && serverName.trim()) {
        settings.serverName = serverName.trim().slice(0, 50);
    }

    if (
        Number.isInteger(maxPlayers) &&
        maxPlayers >= 1 &&
        maxPlayers <= 100
    ) {
        settings.maxPlayers = maxPlayers;
    }

    if (typeof maintenance === "boolean") {
        settings.maintenance = maintenance;
    }

    res.json({ success: true, settings });
});

// BAN PLAYER
app.post("/api/admin/ban", requireAdmin, (req, res) => {
    const id = req.body?.id;

    if (typeof id !== "string" || !players.has(id)) {
        return res.status(404).json({ error: "Žaidėjas nerastas" });
    }

    const socket = io.sockets.sockets.get(id);

    if (socket) {
        socket.emit("banned", {
            message: "Prieiga prie serverio užblokuota."
        });
        socket.disconnect(true);
    }

    res.json({ success: true });
});

// ADMIN LOGOUT
app.post("/api/admin/logout", requireAdmin, (req, res) => {
    const token = req.headers.authorization.slice(7);
    tokens.delete(token);
    res.json({ success: true });
});

// MULTIPLAYER CONNECTION
io.on("connection", socket => {
    if (settings.maintenance || players.size >= settings.maxPlayers) {
        socket.emit("serverUnavailable");
        socket.disconnect(true);
        return;
    }

    const player = {
        id: socket.id,
        username: "Player_" + socket.id.slice(0, 5),
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
    };

    players.set(socket.id, player);

    // Atsiųsti jau prisijungusius žaidėjus
    socket.emit("playersUpdate", publicPlayers());

    // Pranešimas iš administratoriaus
    socket.emit("adminMessage", { message: announcement });

    // Pranešti kitiems apie naują žaidėją
    socket.broadcast.emit("playerJoined", player);

    io.emit("playersUpdate", publicPlayers());

    // Žaidėjo judėjimo sinchronizavimas
    socket.on("playerMove", data => {
        const current = players.get(socket.id);

        if (!current || !data || typeof data !== "object") {
            return;
        }

        const x = Number(data.x);
        const z = Number(data.z);
        const rotation = Number(data.rotation);

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(z) ||
            !Number.isFinite(rotation)
        ) {
            return;
        }

        current.position.x = Math.max(-45, Math.min(45, x));
        current.position.z = Math.max(-45, Math.min(45, z));
        current.rotation = rotation;

        socket.broadcast.emit("playerMoved", {
            id: socket.id,
            position: current.position,
            rotation: current.rotation
        });
    });

    socket.on("disconnect", () => {
        players.delete(socket.id);

        io.emit("playerLeft", { id: socket.id });
        io.emit("playersUpdate", publicPlayers());
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Neo Shooter 3D server running on port " + PORT);
});
l