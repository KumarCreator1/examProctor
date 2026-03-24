module.exports = (io, socket, { exams, supabase }) => {
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
      
      // INDUSTRY GRADE: Reconstruct from Database if Node Cache was flushed
      if (!exam && proctorId) {
         console.log(`[Architecture] RAM Miss. Checking DB for Room ${examCode}...`);
         
         const { data } = await supabase.from('exams').select('*').eq('proctor_id', proctorId).order('created_at', { ascending: false }).limit(1).single();
         
         if (data && data.title && data.title.includes(`[Code: ${examCode}]`)) {
             exam = {
                 dbExamId: data.id,
                 examCode: examCode,
                 examName: data.title.replace(/ \[Code:.*\]/, '').trim(),
                 proctor: socket.id,
                 sessions: new Map(),
                 activeJoins: new Set(),
                 createdAt: Date.now(),
             };
             exams.set(examCode, exam);
             console.log(`[Architecture] Successfully Resurrected Room ${examCode}.`);
         } else {
             if (typeof ack === "function") ack({ ok: false, error: "Exam room closed or not found" });
             return;
         }
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
             // Overwrite Postgres title so the Dashboard refresh logic inherently ignores this dead room
             supabase.from('exams').update({ title: `${exam.examName} (Archived)` }).eq('id', exam.dbExamId).then();
         }

         exams.delete(examCode);
         console.log(`[Exam Room] Securely CLOSED: ${examCode} by verified Proctor.`);
      } else {
         console.log(`[Access Denied] Socket ${socket.id} attempted to close exam ${examCode} but is not the registered proctor.`);
      }
    });

    socket.on("disconnect", () => {
       // Optional: Log when proctor window closes specifically
    });
};
