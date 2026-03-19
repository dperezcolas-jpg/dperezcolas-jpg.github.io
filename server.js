const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const bcrypt = require("bcrypt");

app.use(express.static("public"));

// 📂 ARCHIVO
const ACCOUNTS_FILE = "accounts.json";

// 📥 CARGAR CUENTAS
let accounts = {};
if (fs.existsSync(ACCOUNTS_FILE)) {
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE));
}

// 💾 GUARDAR
function saveAccounts() {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

// 👥 Usuarios conectados
let users = {};

// 🗂️ Historial de mensajes por sala
let roomMessages = {};

io.on("connection", socket => {
  console.log("Usuario conectado:", socket.id);

  // 🔐 REGISTRO
  socket.on("register", async ({ username, password }) => {
    if (accounts[username]) {
      socket.emit("register-error", "El usuario ya existe");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      accounts[username] = hashedPassword;
      saveAccounts();

      socket.emit("register-success");
    }
  });

  // 🔐 LOGIN
  socket.on("login", async ({ username, password }) => {
    const hashedPassword = accounts[username];

    if (!hashedPassword) {
      socket.emit("login-error", "Usuario no existe");
      return;
    }

    const match = await bcrypt.compare(password, hashedPassword);

    if (match) {
      socket.emit("login-success", username);
    } else {
      socket.emit("login-error", "Contraseña incorrecta");
    }
  });

  // 🎧 UNIRSE A SALA POR NÚMERO
  socket.on("join-room", ({ room, name }) => {
    // salir de la sala anterior
    if (users[socket.id]) {
      socket.leave(users[socket.id].room);
    }

    socket.join(room);

    users[socket.id] = { name, room };

    console.log(name, "se unió a sala", room);

    actualizarUsuarios(room);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      name: name
    });

    // 📜 Mensaje de conexión
    const msgData = {
      name: "Sistema",
      message: `${name} se ha conectado`,
      time: new Date().toISOString()
    };
    roomMessages[room] = roomMessages[room] || [];
    roomMessages[room].push(msgData);
    io.to(room).emit("receive-message", msgData);

    // 📜 Enviar historial de mensajes de la sala
    socket.emit("room-history", roomMessages[room]);
  });

  // 💬 MENSAJES
  socket.on("send-message", message => {
    const user = users[socket.id];
    if (!user) return;

    const msgData = {
      name: user.name,
      message: message,
      time: new Date().toISOString()
    };

    // Guardar en historial
    roomMessages[user.room].push(msgData);

    io.to(user.room).emit("receive-message", msgData);
  });

  // 🔗 WEBRTC
  socket.on("signal", data => {
    io.to(data.to).emit("signal", {
      from: socket.id,
      signal: data.signal
    });
  });

  // 🎤 DETECTAR QUIÉN HABLA
  socket.on("speaking", isSpeaking => {
    const user = users[socket.id];
    if (!user) return;

    io.to(user.room).emit("user-speaking", {
      name: user.name,
      speaking: isSpeaking
    });
  });

  // ❌ DESCONECTAR
  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      console.log(user.name, "se desconectó");

      const room = user.room;
      delete users[socket.id];

      actualizarUsuarios(room);

      // 📜 Mensaje de desconexión
      const msgData = {
        name: "Sistema",
        message: `${user.name} se ha desconectado`,
        time: new Date().toISOString()
      };
      roomMessages[room] = roomMessages[room] || [];
      roomMessages[room].push(msgData);
      io.to(room).emit("receive-message", msgData);

      // 🗑️ Si ya no queda nadie en la sala, borrar historial
      const stillUsers = Object.values(users).filter(u => u.room === room);
      if (stillUsers.length === 0) {
        delete roomMessages[room];
        console.log("Sala", room, "vacía. Historial borrado.");
      }
    }
  });

  // 🔄 ACTUALIZAR USUARIOS
  function actualizarUsuarios(room) {
    const lista = [];
    for (let id in users) {
      if (users[id].room === room) {
        lista.push(users[id].name);
      }
    }
    io.to(room).emit("update-users", lista);
  }
});

http.listen(3000, () => {
  console.log("Servidor en http://localhost:3000");
});
