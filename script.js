console.log("JS cargado");

const socket = io();

let currentUser = "";
let currentRoom = "";

let peerConnections = {};
let stream;
let isMuted = false;
let userElements = {};

// 🔐 REGISTRO
function registrar() {
  const username = document.getElementById("user").value;
  const password = document.getElementById("pass").value;

  socket.emit("register", { username, password });
}

// 🔐 LOGIN
function login() {
  const username = document.getElementById("user").value;
  const password = document.getElementById("pass").value;

  socket.emit("login", { username, password });
}

// 📥 RESPUESTAS
socket.on("register-success", () => {
  document.getElementById("authMsg").textContent = "Registrado correctamente";
});

socket.on("register-error", msg => {
  document.getElementById("authMsg").textContent = msg;
});

socket.on("login-success", username => {
  currentUser = username;

  document.getElementById("auth").style.display = "none";
  document.querySelector(".container").style.display = "flex";
});

socket.on("login-error", msg => {
  document.getElementById("authMsg").textContent = msg;
});

// 🎧 ENTRAR A SALA POR NÚMERO
async function entrarSala() {
  const room = document.getElementById("roomNumber").value.trim();
  if (!room) return;

  currentRoom = room;

  stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  socket.emit("join-room", {
    room: currentRoom,
    name: currentUser
  });

  // ⚠️ EVITAR DUPLICAR EVENTOS
  socket.off("user-joined");
  socket.off("signal");

  // 👤 NUEVO USUARIO
  socket.on("user-joined", async user => {
    const peer = createPeer(user.id);
    peerConnections[user.id] = peer;

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("signal", {
      to: user.id,
      signal: offer
    });
  });

  // 🔗 WEBRTC SIGNAL
  socket.on("signal", async data => {
    let peer = peerConnections[data.from];

    if (!peer) {
      peer = createPeer(data.from);
      peerConnections[data.from] = peer;
    }

    if (data.signal.type === "offer") {
      await peer.setRemoteDescription(data.signal);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("signal", {
        to: data.from,
        signal: answer
      });
    } else {
      await peer.setRemoteDescription(data.signal);
    }
  });

  // 🎤 DETECTOR DE VOZ
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  const mic = ctx.createMediaStreamSource(stream);

  mic.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  setInterval(() => {
    analyser.getByteFrequencyData(data);
    let vol = data.reduce((a, b) => a + b) / data.length;

    socket.emit("speaking", vol > 20);
  }, 500);
}

// 🔗 CREAR PEER
function createPeer(userId) {
  const peer = new RTCPeerConnection();

  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  peer.ontrack = event => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  return peer;
}

// 💬 CHAT
function enviarMensaje() {
  const input = document.getElementById("message");
  const msg = input.value.trim();

  if (!msg) return;

  socket.emit("send-message", msg);
  input.value = "";
}

socket.on("receive-message", data => {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");

  const isMe = data.name === currentUser;

  div.className = "message " + (isMe ? "me" : "other");

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  div.innerHTML = `
    <div class="meta">${data.name} • ${time}</div>
    <div>${data.message}</div>
  `;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
});

// 👥 USUARIOS
socket.on("update-users", users => {
  const lista = document.getElementById("users");
  lista.innerHTML = "";
  userElements = {};

  users.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user;
    userElements[user] = li;
    lista.appendChild(li);
  });
});

// 🎤 QUIÉN HABLA
socket.on("user-speaking", data => {
  const el = userElements[data.name];
  if (!el) return;

  if (data.speaking) {
    el.classList.add("speaking");
  } else {
    el.classList.remove("speaking");
  }
});

// 🔊 MUTE
function toggleMute() {
  if (!stream) return;

  isMuted = !isMuted;

  stream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  document.getElementById("muteBtn").textContent = isMuted ? "🔇" : "🔊";
}

// ⌨️ ENTER
document.getElementById("message").addEventListener("keypress", e => {
  if (e.key === "Enter") enviarMensaje();
});

// 📜 Historial de sala
socket.on("room-history", history => {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";

  history.forEach(data => {
    const div = document.createElement("div");
    const isMe = data.name === currentUser;

    div.className = "message " + (isMe ? "me" : "other");

    const time = new Date(data.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    div.innerHTML = `
      <div class="meta">${data.name} • ${time}</div>
      <div>${data.message}</div>
    `;

    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
});

// 🎧 CREAR SALA ALEATORIA
function crearSala() {
  const password = document.getElementById("roomPass").value.trim();

  socket.emit("create-room", {
    name: currentUser,
    password
  });
}

// 📥 Recibir número de sala creada
socket.on("room-created", room => {
  currentRoom = room;
  document.getElementById("roomNumber").value = room;

  stream = navigator.mediaDevices.getUserMedia({ audio: true });

  socket.emit("join-room", {
    room,
    name: currentUser,
    password: document.getElementById("roomPass").value.trim(),
    host: true
  });
});

// 📜 Historial de sala (igual que antes)
socket.on("room-history", history => {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";

  history.forEach(data => {
    const div = document.createElement("div");
    const isMe = data.name === currentUser;

    div.className = "message " + (isMe ? "me" : "other");

    const time = new Date(data.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    div.innerHTML = `
      <div class="meta">${data.name} • ${time}</div>
      <div>${data.message}</div>
    `;

    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
});

// 👥 USUARIOS (añadimos coronita al host)
socket.on("update-users", users => {
  const lista = document.getElementById("users");
  lista.innerHTML = "";
  userElements = {};

  users.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user.name + (user.host ? " 👑" : "");
    userElements[user.name] = li;
    lista.appendChild(li);
  });
});
