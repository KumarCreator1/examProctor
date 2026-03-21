/**
 * Robust Socket.io handler — Class-based Exam Room Architecture
 * WITH Supabase Persistent DB Auditing & Strict Race Condition Locks
 */

const { supabase } = require('./lib/supabase');

// examCode => { dbExamId, examCode, examName, proctorId, sessions: Map<sessionId, SessionData>, activeJoins: Set<string> }
const exams = new Map();

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ─── PROCTOR: Create a new classroom ───────────────────────────────
    socket.on("dashboard:create_exam", async ({ examName, proctorId }, ack) => {
      const examCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      let dbExamId = null;
      if (proctorId) {
         const { data, error } = await supabase.from('exams').insert({
             proctor_id: proctorId,
             title: `${examName} [Code: ${examCode}]`,
             duration_minutes: 120
         }).select('id').single();
         
         if (data) dbExamId = data.id;
         if (error) console.error("[DB Error] Creating exam:", error);
      }

      exams.set(examCode, {
        dbExamId,
        examCode,
        examName: examName || "Unnamed Exam",
        proctor: socket.id,
        sessions: new Map(),
        activeJoins: new Set(), // Lock to prevent async race conditions
        createdAt: Date.now(),
      });

      socket.join(examCode);
      socket.data.role = "proctor";
      socket.data.examCode = examCode;

      console.log(`[Exam Room] Created: ${examCode} (${examName}) | DB ID: ${dbExamId}`);
      if (typeof ack === "function") ack({ ok: true, examCode });
    });

    // ─── PROCTOR: Re-join an active classroom ──────────────────────────
    socket.on("dashboard:subscribe", async ({ examCode, proctorId }, ack) => {
      let exam = exams.get(examCode);
      
      // INDUSTRY GRADE: Reconstruct from Database if Node Cache was flushed (e.g. Server restart)
      if (!exam && proctorId) {
         console.log(`[Architecture] RAM Miss. Resurrecting Room ${examCode} transparently.`);
         
         exam = {
             dbExamId: null,
             examCode: examCode,
             examName: "Recovering Context...",
             proctor: socket.id,
             sessions: new Map(),
             activeJoins: new Set(),
             createdAt: Date.now(),
         };
         exams.set(examCode, exam);
         
         // Fetch metadata asynchronously payload
         supabase.from('exams').select('*').eq('proctor_id', proctorId).order('created_at', { ascending: false }).limit(1).single().then(({ data }) => {
            if (data) {
               exam.dbExamId = data.id;
               exam.examName = data.title.replace(/ \[Code:.*\]/, '').trim();
            }
         });
      }

      if (!exam) {
        if (typeof ack === "function") ack({ ok: false, error: "Exam room not found" });
        return;
      }
      
      socket.join(examCode);
      socket.data.role = "proctor";
      socket.data.examCode = examCode;
      
      // Update session ownership in case of a hard Page Refresh where socket.id changes!
      exam.proctor = socket.id;

      console.log(`[Exam Room] Proctor cleanly subscribed to: ${examCode}`);

      const snapshot = Array.from(exam.sessions.values());
      if (typeof ack === "function") ack({ ok: true, examCode, sessions: snapshot });
    });

    // ─── PROCTOR: Forcefully End Exam ──────────────────────────────────
    socket.on("dashboard:end_exam", ({ examCode }) => {
      const exam = exams.get(examCode);
      if (exam && exam.proctor === socket.id) {
         io.to(examCode).emit("alert", { 
            level: "RED", 
            code: "EXAM_ENDED", 
            details: "The Proctor securely closed the active Room.",
            timestamp: Date.now()
         });
         
         // Fire explicit teardown event to all student terminals & sentinels
         io.to(examCode).emit("exam:ended");
         
         // Gracefully update the database audits for all related sessions in parallel
         if (exam.dbExamId) {
             supabase.from('sessions').update({ status: 'completed' }).eq('exam_id', exam.dbExamId).then();
         }

         exams.delete(examCode);
         console.log(`[Exam Room] Securely CLOSED: ${examCode} by verified Proctor.`);
      } else {
         console.log(`[Access Denied] Socket ${socket.id} attempted to close exam ${examCode} but is not the registered proctor.`);
      }
    });

    // ─── TERMINAL (Student LAPTOP): Enter a code to join the exam ──────
    socket.on("session:create", async ({ examCode, studentEmail, studentId }, ack) => {
      const exam = exams.get(examCode);
      if (!exam) {
        if (typeof ack === "function") ack({ ok: false, error: "Invalid Exam Code. Check spelling." });
        return;
      }

      // STRICT RACE CONDITION LOCK
      // Prevents the identical student ID from bypassing the async/await yield 
      if (studentId && exam.activeJoins.has(studentId)) {
         if (typeof ack === "function") ack({ ok: false, error: "Server is currently processing your request. Please wait." });
         return;
      }
      
      if (studentId) exam.activeJoins.add(studentId);

      try {
        // Cleanup old persistent sessions natively FIRST
        if (studentId) {
           for (const [existingId, existingSession] of exam.sessions.entries()) {
               if (existingSession.studentId === studentId) {
                   console.log(`[Session] Eliminating duplicate ghost session ${existingId} for ${studentEmail}`);
                   exam.sessions.delete(existingId);
                   io.to(examCode).emit("session:removed", { sessionId: existingId });
                   
                   // Fire and forget the status update to clear old DB trail
                   if(existingSession.dbSessionId) {
                      supabase.from('sessions').update({ status: 'completed' }).eq('id', existingSession.dbSessionId).then();
                   }
               }
           }
        }

        const sessionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        
        let dbSessionId = null;
        if (exam.dbExamId && studentId) {
            const { data, error } = await supabase.from('sessions').insert({
                exam_id: exam.dbExamId,
                student_id: studentId,
                status: 'waiting',
                trust_score: 100
            }).select('id').single();

            if (data) dbSessionId = data.id;
            if (error) console.error("[DB Error] Creating session:", error);
        }

        const sessionData = {
          dbSessionId,
          sessionId,
          examCode,
          studentEmail: studentEmail || "Anonymous",
          studentId,
          terminal: socket.id,
          sentinel: null,
          status: "waiting", 
          trustScore: 100,
          flags: [],
          battery: null,
          charging: false,
          lastHeartbeat: null,
          createdAt: Date.now(),
        };

        exam.sessions.set(sessionId, sessionData);

        socket.join(examCode);
        socket.join(sessionId);

        socket.data.role = "terminal";
        socket.data.examCode = examCode;
        socket.data.sessionId = sessionId;

        console.log(`[Student] ${studentEmail} joined exam ${examCode} (Desk: ${sessionId})`);
        io.to(examCode).emit("session:created", sessionData);

        if (typeof ack === "function") ack({ ok: true, sessionId });
      } finally {
        if (studentId) exam.activeJoins.delete(studentId);
      }
    });

    // ─── TERMINAL: Re-link an explicitly restored session from localStorage ──────
    socket.on("session:restore", ({ examCode, sessionId, studentId }, ack) => {
      const exam = exams.get(examCode);
      if (!exam) {
         if (typeof ack === "function") ack({ ok: false });
         return;
      }

      let session = exam.sessions.get(sessionId);
      
      // INDUSTRY GRADE: Actively repair broken network connections if UI tab survived but Node died
      if (!session && studentId) {
         console.log(`[Architecture] JIT Assembly of missing student UUID ${sessionId}`);
         session = {
            dbSessionId: null,
            sessionId,
            examCode,
            studentEmail: "Recovering...",
            studentId,
            terminal: socket.id,
            sentinel: null,
            status: "waiting",
            trustScore: 100,
            flags: [],
            battery: null,
            charging: false,
            lastHeartbeat: Date.now(),
            createdAt: Date.now()
         };
         exam.sessions.set(sessionId, session);
         
         // Non-blocking query payload completion
         supabase.from('profiles').select('email').eq('id', studentId).single().then(({ data }) => {
             if (data) session.studentEmail = data.email;
             io.to(examCode).emit("session:updated", session);
         });
      }
      
      if (session && session.studentId === studentId) {
         // Successfully re-tethered
         session.terminal = socket.id;
         if (session.status === "offline") {
            session.status = session.sentinel ? "paired" : "waiting";
            if (session.startedAt) session.status = "active";
         }
         
         socket.join(examCode);
         socket.join(sessionId);
         socket.data = { role: "terminal", examCode, sessionId };

         io.to(examCode).emit("session:updated", session);
         console.log(`[Session] Explicitly restored Terminal for ${sessionId}`);
         if (typeof ack === "function") ack({ ok: true });
      } else {
         if (typeof ack === "function") ack({ ok: false });
      }
    });

    // ─── SENTINEL (Student PHONE): Scans QR to pair to the Desk ────────
    socket.on("session:join", async ({ sessionId }, ack) => {
      console.log(`[Sentinel Debug] session:join received from ${socket.id} with sessionId: ${sessionId}`);
      console.log(`[Sentinel Debug] Total exam rooms in memory: ${exams.size}`);
      
      let targetExamCode = null;
      let targetSession = null;

      for (const [eCode, exam] of exams.entries()) {
        console.log(`[Sentinel Debug] Checking exam ${eCode}, sessions: [${Array.from(exam.sessions.keys()).join(', ')}]`);
        if (exam.sessions.has(sessionId)) {
          targetExamCode = eCode;
          targetSession = exam.sessions.get(sessionId);
          break;
        }
      }

      if (!targetSession) {
        console.log(`[Sentinel Debug] FAILED — no matching session found for ${sessionId}`);
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
         // Fire and forget
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

    // ─── Exam starts (Laptop locks) ───────────────────────────────────
    socket.on("exam:start", () => {
      const { examCode, sessionId } = socket.data;
      if (!examCode || !sessionId) return;

      const session = exams.get(examCode)?.sessions?.get(sessionId);
      if (session) {
        session.status = "active";
        session.startedAt = Date.now();
      }

      io.to(examCode).emit("session:updated", session);
    });

    // ─── Manual Exam Departure ─────────────────────────────────────────
    socket.on("session:leave", ({ examCode, sessionId }, ack) => {
      const exam = exams.get(examCode);
      if (exam) {
        const session = exam.sessions.get(sessionId);
        if (session) {
          session.status = "completed";
          session.terminal = null;
          
          io.to(examCode).emit("session:updated", session);
          
          if (session.dbSessionId) {
             supabase.from('sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', session.dbSessionId).then();
          }
        }
      }
      
      socket.data.examCode = null;
      socket.data.sessionId = null;
      socket.leave(examCode);
      socket.leave(sessionId);
      
      if (typeof ack === 'function') ack({ok: true});
    });

    // ─── Disconnection Handling ─────────────────────────────────────
    socket.on("disconnect", () => {
      const { role, examCode, sessionId } = socket.data;
      
      if (!examCode) return;
      const exam = exams.get(examCode);
      if (!exam) return;

      if (role === "proctor") return;

      const session = exam.sessions.get(sessionId);
      if (!session) return;

      if (role === "sentinel") {
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

      if (role === "terminal") {
        session.terminal = null;
        session.status = "offline";
        io.to(examCode).emit("session:updated", session);
        console.log(`[Student] ${sessionId} marked OFFLINE due to disconnect.`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
