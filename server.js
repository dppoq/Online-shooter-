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

function cleanText(value, maxLength = 20) {
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
    const allowedWeapons = ["neon", "gold", "ice", "purple", "red"];
    const allowedShields = ["blue", "gold", "green", "purple"];
    const allowedOutfits = ["default", "dark", "red", "gold"];

    return {
        weapon: allowedWeapons.includes(value?.weapon)
            ? value.weapon : "neon",
        shield: allowedShields.includes(value?.shield)
            ? value.shield : "blue",
        outfit: allowedOutfits.includes(value?.outfit)
            ? value.outfit : "default"
    };
}

function publicPlayer(player) {
    return {
        id: player.id,
        username: player.username,
        color: player.color,
        x: player.x,
        z: player.z,
        rotation: player.rotation,
        equipment: player.equipment
    };
}

function broadcastPlayers() {
    io.emit(
        "playersUpdate",
        Array.from(players.values()).map(publicPlayer)
    );
}

function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
        ? header.slice(7)
        : "";

    const expires = adminTokens.get(token);

    if (!expires || expires < Date.now()) {
        adminTokens.delete(token);
        return res.status(401).json({
            success: false,
            message: "Administratoriaus prisijungimas nebegalioja."
        });
    }

    next();
}

// ADMIN LOGIN
app.post("/api/admin/login", (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return res.status(500).json({
            success: false,
            message: "Render aplinkos kintamieji nesukonfigūruoti."
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
        token
    });
});

// SERVER STATUS
app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        players: players.size,
        settings
    });
});

// PLAYER LIST
app.get("/api/players", requireAdmin, (req, res) => {
    res.json({
        players: Array.from(players.values()).map(publicPlayer)
    });
});

// ADMIN MESSAGE
app.post("/api/admin/message", requireAdmin, (req, res) => {
    const message = cleanText(req.body.message, 200);

    if (!message) {
        return res.status(400).json({
            success: false,
            message: "Įrašyk pranešimą."
        });
    }

    io.emit("adminMessage", {
        message,
        time: Date.now()
    });

    res.json({ success: true });
});

// SERVER SETTINGS
app.post("/api/admin/settings", requireAdmin, (req, res) => {
    if (typeof req.body.serverName === "string") {
        settings.serverName =
            cleanText(req.body.serverName, 40) || "Neo Shooter 3D";
    }

    if (req.body.maxPlayers !== undefined) {
        const amount = Number(req.body.maxPlayers);

        if (Number.isInteger(amount) && amount >= 1 && amount <= 100) {
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

// BLOCK PLAYER
app.post("/api/admin/ban", requireAdmin, (req, res) => {
    const playerId = String(req.body.id || "");
    const socket = io.sockets.sockets.get(playerId);

    if (!socket) {
        return res.status(404).json({
            success: false,
            message: "Žaidėjas nerastas."
        });
    }

    socket.emit("banned", {
        message: "Administratorius atjungė tave nuo serverio."
    });

    socket.disconnect(true);

    res.json({ success: true });
});

// ADMIN LOGOUT
app.post("/api/admin/logout", requireAdmin, (req, res) => {
    const header = req.headers.authorization || "";
    const token = header.slice(7);

    adminTokens.delete(token);

    res.json({ success: true });
});

// MULTIPLAYER
io.on("connection", (socket) => {
    if (settings.maintenance) {
        socket.emit("serverNotice", {
            message: "Serveris laikinai prižiūrimas."
        });
        socket.disconnect(true);
        return;
    }

    if (players.size >= settings.maxPlayers) {
        socket.emit("serverNotice", {
            message: "Serveris pilnas."
        });
        socket.disconnect(true);
        return;
    }

    const player = {
        id: socket.id,
        username: "Žaidėjas",
        color: "#00eaff",
        x: 0,
        z: 0,
        rotation: 0,
        equipment: {
            weapon: "neon",
            shield: "blue",
            outfit: "default"
        }
    };

    players.set(socket.id, player);

    socket.emit(
        "playersUpdate",
        Array.from(players.values())
            .filter(item => item.id !== socket.id)
            .map(publicPlayer)
    );

    socket.broadcast.emit("playerJoined", publicPlayer(player));

    socket.on("playerMove", (data = {}) => {
        const current = players.get(socket.id);
        if (!current) return;

        current.username = cleanText(data.username, 18) || "Žaidėjas";
        current.color = cleanColor(data.color);

        current.x = Math.max(-75, Math.min(75, Number(data.x) || 0));
        current.z = Math.max(-75, Math.min(75, Number(data.z) || 0));

        current.rotation = Number.isFinite(Number(data.rotation))
            ? Number(data.rotation)
            : 0;

        current.equipment = cleanEquipment(data.equipment);

        socket.broadcast.emit("playerMoved", publicPlayer(current));
    });

    socket.on("disconnect", () => {
        players.delete(socket.id);

        io.emit("playerLeft", {
            id: socket.id
        });

        broadcastPlayers();
    });
});

// START SERVER
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Neo Shooter 3D server running on port ${PORT}`);
});