
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};

io.on("connection", socket => {
  players[socket.id] = {
    x: 0,
    y: 1.7,
    z: 0
  };

  socket.emit("players", players);

  socket.broadcast.emit("playerJoined", {
    id: socket.id,
    ...players[socket.id]
  });

  socket.on("move", data => {
    if (!data) return;

    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);

    if (![x, y, z].every(Number.isFinite)) return;
    if (Math.abs(x) > 45 || Math.abs(z) > 45) return;

    players[socket.id] = { x, y, z };

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      x, y, z
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Neo Shooter 3D running on port " + PORT);
});