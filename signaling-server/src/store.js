/**
 * Singleton In-Memory State Store
 * 
 * Replaces the monolithic 'const exams = new Map()' with a dedicated, exportable state module.
 * Future-proofing: This file can trivially be upgraded to wrap a Redis Client 
 * once horizontal load-balanced scaling across multiple servers is required.
 */

// examCode => { dbExamId, examCode, examName, proctorId, sessions: Map<sessionId, SessionData>, activeJoins: Set<string> }
const exams = new Map();

module.exports = { exams };
