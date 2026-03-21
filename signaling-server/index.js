require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const { registerSocketHandlers } = require("./src/socket");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Register all socket event handlers
registerSocketHandlers(io);

// Health-check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ─── Serve the built React frontend for the Ngrok single-tunnel architecture ───
// IMPORTANT: Express.static MUST come before the SPA fallback.
// The SPA fallback MUST explicitly skip /socket.io paths.
const clientDistPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientDistPath));

// SPA fallback for client-side routing (React Router)
// Uses a named route param to avoid Express 5 path-to-regexp issues with bare "*"
app.use((req, res, next) => {
  // Never intercept socket.io polling/websocket requests
  if (req.url.startsWith("/socket.io")) {
    return next();
  }
  // Only serve HTML for GET requests that accept text/html (not API/asset requests)
  if (req.method === "GET" && req.accepts("html")) {
    return res.sendFile(path.join(clientDistPath, "index.html"));
  }
  next();
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Signaling Server] Running on port ${PORT}`);
});
