module.exports = (io, socket, { exams, supabase }) => {
    // ─── SENTINEL (Student PHONE): Scans QR to pair to the Desk ────────
    socket.on("session:join", async ({ sessionId }, ack) => {
      console.log(`[Sentinel Debug] session:join received from ${socket.id} with sessionId: ${sessionId}`);
      
      let targetExamCode = null;
      let targetSession = null;

      for (const [eCode, exam] of exams.entries()) {
        if (exam.sessions.has(sessionId)) {
          targetExamCode = eCode;
          targetSession = exam.sessions.get(sessionId);
          break;
        }
      }

      if (!targetSession) {
        if (typeof ack === "function") ack({ ok: false, error: "Desk pairing code expired or invalid." });
        return;
      }

      targetSession.sentinel = socket.id;
      targetSession.status = "paired";

      socket.join(targetExamCode);
      socket.join(sessionId);

      socket.data.role = "sentinel";
      socket.data.examCode = targetExamCode;
      socket.data.sessionId = sessionId;

      console.log(`[Phone] Sentinel paired to Desk ${sessionId} ✓`);

      if (targetSession.dbSessionId) {
         supabase.from('sessions').update({ status: 'active' }).eq('id', targetSession.dbSessionId).then();
      }

      io.to(sessionId).emit("session:paired", { sessionId, sentinelId: socket.id });
      io.to(targetExamCode).emit("session:updated", targetSession);

      if (typeof ack === "function") ack({ ok: true });
    });

    // ─── Sentinel heartbeat ───────────────────────────────────────────
    socket.on("heartbeat", (payload) => {
      const { examCode, sessionId } = socket.data;
      if (!examCode || !sessionId) return;

      const session = exams.get(examCode)?.sessions?.get(sessionId);
      if (session) {
        session.lastHeartbeat = Date.now();
        session.battery = payload.battery;
        session.charging = payload.charging;
      }

      io.to(examCode).emit("heartbeat", { ...payload, sessionId, timestamp: Date.now() });
    });

    // ─── Alerts (Gaze away, Object detection) ─────────────────────────
    socket.on("alert", async (payload) => {
      const { examCode, sessionId } = socket.data;
      if (!examCode || !sessionId) return;

      const session = exams.get(examCode)?.sessions?.get(sessionId);
      if (session) {
        session.flags.push({ ...payload, timestamp: Date.now() });

        if (payload.level === "RED") {
          session.trustScore = Math.max(0, session.trustScore - 15);
        } else if (payload.level === "YELLOW") {
          session.trustScore = Math.max(0, session.trustScore - 5);
        }

        if (session.dbSessionId) {
             supabase.from('flags').insert({
                 session_id: session.dbSessionId,
                 level: payload.level,
                 code: payload.code,
                 details: payload.details
             }).then();
             supabase.from('sessions').update({ trust_score: session.trustScore }).eq('id', session.dbSessionId).then();
        }
      }

      io.to(examCode).emit("alert", { ...payload, sessionId, timestamp: Date.now() });
    });

    // ─── Disconnection Handling ─────────────────────────────────────
    socket.on("disconnect", () => {
      const { role, examCode, sessionId } = socket.data;
      if (role === "sentinel" && examCode && sessionId) {
          const exam = exams.get(examCode);
          if (exam) {
              const session = exam.sessions.get(sessionId);
              if (session) {
                  session.sentinel = null;
                  session.status = "waiting";

                  io.to(sessionId).emit("sentinel:disconnected", { sessionId });
                  io.to(examCode).emit("alert", {
                    sessionId,
                    type: "ALERT",
                    level: "RED",
                    code: "HEARTBEAT_LOST",
                    details: { reason: "Student's Phone explicitly disconnected from Wi-Fi." },
                    timestamp: Date.now(),
                  });
              }
          }
      }
    });
};
