/**
 * Robust Socket.io handler — Domain-Driven Architecture
 * WITH Supabase Persistent DB Auditing & Strict Race Condition Locks
 */

const { supabase } = require('./lib/supabase');
const { exams } = require('./store');

const registerProctorHandlers = require('./handlers/proctor.handler');
const registerTerminalHandlers = require('./handlers/terminal.handler');
const registerSentinelHandlers = require('./handlers/sentinel.handler');

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Inject scaling dependencies into domain-driven isolated micro-controllers
    const dependencies = { exams, supabase };

    registerProctorHandlers(io, socket, dependencies);
    registerTerminalHandlers(io, socket, dependencies);
    registerSentinelHandlers(io, socket, dependencies);
  });
}

module.exports = { registerSocketHandlers };
