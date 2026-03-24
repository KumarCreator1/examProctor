const crypto = require('crypto');

module.exports = (io, socket, { exams, supabase }) => {
    // ─── TERMINAL (Student LAPTOP): Enter a code to join the exam ──────
    socket.on("session:create", async ({ examCode, studentEmail, studentId }, ack) => {
      const exam = exams.get(examCode);
      if (!exam) {
        if (typeof ack === "function") ack({ ok: false, error: "Invalid Exam Code. Check spelling." });
        return;
      }

      // STRICT RACE CONDITION LOCK
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
      if (role === "terminal" && examCode && sessionId) {
          const exam = exams.get(examCode);
          if (exam) {
              const session = exam.sessions.get(sessionId);
              if (session) {
                  session.terminal = null;
                  session.status = "offline";
                  io.to(examCode).emit("session:updated", session);
                  console.log(`[Student] ${sessionId} marked OFFLINE due to disconnect.`);
              }
          }
      }
    });
};
