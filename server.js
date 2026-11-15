require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"]
    }
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const players = new Map();
const adminTokens = new Map();

const settings = {
    serverName: "Neo Shooter 3D",
    maxPlayers: 20,
    maintenance: false
};

// =====================================
// SECURITY
// =====================================

function cleanText(value, maxLength = 100) {
    return String(value || "")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, maxLength);
}

function cleanColor(value) {
    const color = String(value || "#00eaff");

    return /^#[0-9a-fA-F]{6}$/.test(color)
        ? color
        : "#00eaff";
}

function cleanEquipment(value) {
    const weapons = ["neon", "gold", "ice", "purple", "red"];
    const shields = ["blue", "gold", "green", "purple"];
    const outfits = ["default", "dark", "red", "gold"];

    return {
        weapon: weapons.includes(value?.weapon)
            ? value.weapon : "neon",

        shield: shields.includes(value?.shield)
            ? value.shield : "blue",

        outfit: outfits.includes(value?.outfit)
            ? value.outfit : "default"
    };
}

function clamp(value, min, max, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) return fallback;

    return Math.max(min, Math.min(max, number));
}

// =====================================
// ADMIN TOKENS
// =====================================

function getAdminToken(req) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) return null;

    return header.slice(7);
}

function verifyAdminToken(token) {
    if (!token) return false;

    const expires = adminTokens.get(token);

    if (!expires || expires < Date.now()) {
        adminTokens.delete(token);
        return false;
    }

    return true;
}

function requireAdmin(req, res, next) {
    const token = getAdminToken(req);

    if (!verifyAdminToken(token)) {
        return res.status(401).json({
            success: false,
            message: "Administratoriaus prisijungimas negalioja."
        });
    }

    req.adminToken = token;
    next();
}

// =====================================
// PLAYER DATA
// =====================================

function publicPlayer(player) {
    return {
        id: player.id,
        username: player.username,
        color: player.color,

        x: player.x,
        y: player.y,
        z: player.z,

        rotation: player.rotation,
        equipment: player.equipment,

        invisible: player.invisible,
        godMode: player.godMode,
        flying: player.flying,
        speed: player.speed,

        isAdmin: player.isAdmin
    };
}

function broadcastPlayers() {
    io.emit(
        "playersUpdate",
        Array.from(players.values()).map(publicPlayer)
    );
}

function updatePlayer(player) {
    io.emit("playerMoved", publicPlayer(player));
}

// =====================================
// ADMIN PAGE
// =====================================

app.get("/admin", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );
});

// =====================================
// ADMIN LOGIN
// =====================================

app.post("/api/admin/login", (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return res.status(500).json({
            success: false,
            message: "ADMIN_USERNAME arba ADMIN_PASSWORD nesukonfigūruotas."
        });
    }

    if (
        username !== ADMIN_USERNAME ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            success: false,
            message: "Neteisingi prisijungimo duomenys."
        });
    }

    const token = crypto.randomBytes(32).toString("hex");

    adminTokens.set(token, Date.now() + 60 * 60 * 1000);

    res.json({
        success: true,
        token,
        expiresIn: 3600
    });
});

// =====================================
// SERVER STATUS
// =====================================

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        players: players.size,
        settings
    });
});

// =====================================
// PLAYER LIST
// =====================================

app.get("/api/players", requireAdmin, (req, res) => {
    res.json({
        players: Array.from(players.values()).map(publicPlayer)
    });
});

// =====================================
// ADMIN MESSAGE
// =====================================

app.post("/api/admin/message", requireAdmin, (req, res) => {
    const message = cleanText(req.body.message, 200);

    if (!message) {
        return res.status(400).json({
            success: false,
            message: "Įrašyk pranešimą."
        });
    }

    io.emit("adminMessage", {
        text: message,
        message,
        time: Date.now()
    });

    res.json({ success: true });
});

// =====================================
// SERVER SETTINGS
// =====================================

app.post("/api/admin/settings", requireAdmin, (req, res) => {
    if (typeof req.body.serverName === "string") {
        settings.serverName =
            cleanText(req.body.serverName, 40) || "Neo Shooter 3D";
    }

    if (req.body.maxPlayers !== undefined) {
        const amount = Number(req.body.maxPlayers);

        if (
            Number.isInteger(amount) &&
            amount >= 1 &&
            amount <= 100
        ) {
            settings.maxPlayers = amount;
        }
    }

    if (typeof req.body.maintenance === "boolean") {
        settings.maintenance = req.body.maintenance;
    }

    res.json({
        success: true,
        settings
    });
});

// =====================================
// ADMIN PLAYER POWERS
// =====================================

app.post("/api/admin/powers", requireAdmin, (req, res) => {
    const player = players.get(String(req.body.id || ""));

    if (!player) {
        return res.status(404).json({
            success: false,
            message: "Žaidėjas nerastas."
        });
    }

    const powers = req.body.powers || {};

    if (typeof powers.invisible === "boolean") {
        player.invisible = powers.invisible;
    }

    if (typeof powers.godMode === "boolean") {
        player.godMode = powers.godMode;
    }

    if (typeof powers.flying === "boolean") {
        player.flying = powers.flying;
    }

    if (powers.speed !== undefined) {
        player.speed = clamp(powers.speed, 0.5, 5, 1);
    }

    if (!player.flying) {
        player.y = 0;
    }

    updatePlayer(player);

    res.json({
        success: true,
        player: publicPlayer(player)
    });
});

// =====================================
// ADMIN TELEPORT
// =====================================

app.post("/api/admin/teleport", requireAdmin, (req, res) => {
    const player = players.get(String(req.body.id || ""));

    if (!player) {
        return res.status(404).json({
            success: false,
            message: "Žaidėjas nerastas."
        });
    }

    player.x = clamp(req.body.x, -75, 75, 0);
    player.z = clamp(req.body.z, -75, 75, 0);
    player.y = player.flying
        ? clamp(req.body.y, 0, 30, 0)
        : 0;

    updatePlayer(player);

    res.json({
        success: true,
        player: publicPlayer(player)
    });
});

// =====================================
// ADMIN DISCONNECT PLAYER
// =====================================

app.post("/api/admin/ban", requireAdmin, (req, res) => {
    const playerId = String(req.body.id || "");
    const playerSocket = io.sockets.sockets.get(playerId);

    if (!playerSocket || !players.has(playerId)) {
        return res.status(404).json({
            success: false,
            message: "Žaidėjas nerastas."
        });
    }

    playerSocket.emit("banned", {
        message: "Administratorius atjungė tave nuo serverio."
    });

    playerSocket.disconnect(true);

    res.json({ success: true });
});

// =====================================
// ADMIN LOGOUT
// =====================================

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    adminTokens.delete(req.adminToken);

    res.json({ success: true });
});

// =====================================
// SOCKET ADMIN AUTH
// =====================================

io.use((socket, next) => {
    const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
        socket.data.isAdmin = false;
        return next();
    }

    if (!verifyAdminToken(token)) {
        return next(new Error("Administratoriaus prisijungimas negalioja."));
    }

    socket.data.isAdmin = true;
    next();
});

// =====================================
// GAME SERVER
// =====================================

io.on("connection", socket => {
    const isAdmin = socket.data.isAdmin === true;

    if (!isAdmin && settings.maintenance) {
        socket.emit("serverNotice", {
            message: "Serveris laikinai prižiūrimas."
        });

        socket.disconnect(true);
        return;
    }

    if (!isAdmin && players.size >= settings.maxPlayers) {
        socket.emit("serverNotice", {
            message: "Serveris pilnas."
        });

        socket.disconnect(true);
        return;
    }

    const player = {
        id: socket.id,

        username: isAdmin ? "Administratorius" : "Žaidėjas",
        color: isAdmin ? "#ffcc00" : "#00eaff",

        x: 0,
        y: 0,
        z: 0,

        rotation: 0,

        equipment: {
            weapon: "neon",
            shield: "blue",
            outfit: "default"
        },

        invisible: false,
        godMode: false,
        flying: false,
        speed: 1,

        isAdmin
    };

    players.set(socket.id, player);

    socket.emit(
        "playersUpdate",
        Array.from(players.values())
            .filter(item => item.id !== socket.id)
            .map(publicPlayer)
    );

    socket.broadcast.emit(
        "playerJoined",
        publicPlayer(player)
    );

    // =================================
    // PLAYER MOVEMENT
    // =================================

    socket.on("playerMove", (data = {}) => {
        const current = players.get(socket.id);

        if (!current) return;

        current.username =
            cleanText(data.username, 18) ||
            (current.isAdmin ? "Administratorius" : "Žaidėjas");

        current.color = cleanColor(data.color);

        current.equipment = cleanEquipment(data.equipment);

        // Admin powers
        if (current.isAdmin) {
            if (typeof data.invisible === "boolean") {
                current.invisible = data.invisible;
            }

            if (typeof data.godMode === "boolean") {
                current.godMode = data.godMode;
            }

            if (typeof data.flying === "boolean") {
                current.flying = data.flying;
            }

            if (data.speed !== undefined) {
                current.speed = clamp(data.speed, 0.5, 5, 1);
            }
        }

        // Position
        const requestedX = clamp(data.x, -75, 75, current.x);
        const requestedZ = clamp(data.z, -75, 75, current.z);

        const dx = requestedX - current.x;
        const dz = requestedZ - current.z;

        const distance = Math.sqrt(dx * dx + dz * dz);

        const maxDistance = 4 * current.speed;

        if (distance > maxDistance) {
            const factor = maxDistance / distance;

            current.x += dx * factor;
            current.z += dz * factor;
        } else {
            current.x = requestedX;
            current.z = requestedZ;
        }

        if (current.flying) {
            current.y = clamp(data.y, 0, 30, current.y);
        } else {
            current.y = 0;
        }

        current.rotation = clamp(
            data.rotation,
            -1000,
            1000,
            0
        );

        socket.broadcast.emit(
            "playerMoved",
            publicPlayer(current)
        );
    });

    // =================================
    // DISCONNECT
    // =================================

    socket.on("disconnect", () => {
        players.delete(socket.id);

        io.emit("playerLeft", {
            id: socket.id
        });

        broadcastPlayers();
    });
});

// =====================================
// TOKEN CLEANUP
// =====================================

setInterval(() => {
    const now = Date.now();

    for (const [token, expires] of adminTokens) {
        if (expires < now) {
            adminTokens.delete(token);
        }
    }
}, 5 * 60 * 1000);

// =====================================
// START SERVER
// =====================================

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Neo Shooter 3D running on port ${PORT}`
    );
});