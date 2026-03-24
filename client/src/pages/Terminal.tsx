import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../components/SocketProvider';
import { useAuth } from '../components/AuthProvider';
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import { Navbar } from '../components/Navbar';

type Phase = 'lobby' | 'pairing' | 'ready' | 'exam';

export default function Terminal() {
  const { user, signOut } = useAuth();
  const socket = useSocket();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [examCodeInput, setExamCodeInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [examCode, setExamCode] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Restore state management from a page refresh
  useEffect(() => {
    const saved = localStorage.getItem('integrity_session');
    if (saved) {
       try {
         const parsed = JSON.parse(saved);
         if (parsed.examCode && parsed.sessionId && parsed.phase) {
           setExamCode(parsed.examCode);
           setSessionId(parsed.sessionId);
           setPhase(parsed.phase);
         }
       } catch(e) {}
    }
  }, []);

  // When socket connects and we have an orphaned session, try to actively resurrect it
  useEffect(() => {
    if (!socket || !examCode || !sessionId || !user) return;
    
    const attemptRestore = () => {
      socket.emit('session:restore', { examCode, sessionId, studentId: user.id }, (res: any) => {
        if (!res.ok) {
           // Server rejected the session (garbage collected or invalid), boot to lobby!
           localStorage.removeItem('integrity_session');
           setPhase('lobby');
           setSessionId('');
           setExamCode('');
        } else {
           // If we successfully restored and the phase was 'exam', lock the UI back down
           if (phase === 'exam') {
             socket.emit('exam:start');
           }
        }
      });
    };

    if (socket.connected) {
       attemptRestore();
    } else {
       socket.once('connect', attemptRestore);
    }
  }, [socket, examCode, sessionId, user, phase]);

  // Save current dynamic state progression to user's browser
  useEffect(() => {
    if (sessionId && phase) {
      localStorage.setItem('integrity_session', JSON.stringify({
        sessionId,
        examCode,
        phase
      }));
    }
  }, [sessionId, examCode, phase]);

  const handleLeaveExam = () => {
    if (window.confirm("Are you sure you want to leave the exam? Your session will be permanently marked as completed.")) {
       setLoading(true);
       socket?.emit('session:leave', { examCode, sessionId }, () => {
          signOut();
       });
    }
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [model, setModel] = useState<blazeface.BlazeFaceModel | null>(null);
  const [gazeWarning, setGazeWarning] = useState(false);

  // Load TF.js model softly in background
  useEffect(() => {
    async function loadModel() {
      await tf.ready();
      const loadedModel = await blazeface.load();
      setModel(loadedModel);
    }
    loadModel();
  }, []);

  const handleJoinExam = () => {
    if (!socket || !examCodeInput || !user || loading) return;
    
    setLoading(true);
    socket.emit('session:create', { 
       examCode: examCodeInput.toUpperCase(),
       studentEmail: user?.email,
       studentId: user?.id
    }, (res: any) => {
       setLoading(false);
       if (res.ok) {
         setExamCode(examCodeInput.toUpperCase());
         setSessionId(res.sessionId);
         setPhase('pairing'); // move to pairing phase
       } else {
         alert(res.error || 'Failed to join exam. Please check your spelling.');
       }
    });
  };

  useEffect(() => {
    if (!socket || !sessionId) return;

    const onPaired = () => {
      setPhase('ready');
    };

    const onDisconnected = () => {
      alert('WARNING: Your Sentinel camera disconnected! Exam paused. Please re-check your smartphone Wi-Fi immediately.');
      setPhase('ready'); // drop back
    };

    const onExamEnded = () => {
       alert('The Proctor has gracefully concluded and closed this exam room. Your session is complete.');
       localStorage.removeItem('integrity_session');
       setPhase('lobby');
       setSessionId('');
       setExamCode('');
    };

    socket.on('session:paired', onPaired);
    socket.on('sentinel:disconnected', onDisconnected);
    socket.on('exam:ended', onExamEnded);

    return () => {
      socket.off('session:paired', onPaired);
      socket.off('sentinel:disconnected', onDisconnected);
      socket.off('exam:ended', onExamEnded);
    };
  }, [socket, sessionId]);

  // Set up camera and face tracking when exam starts
  useEffect(() => {
    if (phase !== 'exam' || !model) return;

    let activeStream: MediaStream | null = null;
    let requestAnimationFrameId: number;

    async function setupCamera() {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
           activeStream = await navigator.mediaDevices.getUserMedia({
             video: { facingMode: 'user', width: 640, height: 480 },
           });
           if (videoRef.current) {
             videoRef.current.srcObject = activeStream;
           }
        } catch(e) { /* ignore */ }
      }
    }

    async function detectFace() {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const predictions = await model!.estimateFaces(videoRef.current, false);
        
        if (predictions.length === 0) {
          setGazeWarning(true);
          socket?.emit('alert', {
            level: 'YELLOW',
            code: 'FACE_MISSING',
            details: 'No face detected in webcam',
          });
        } else {
          setGazeWarning(false);
        }
      }
      requestAnimationFrameId = requestAnimationFrame(detectFace);
    }

    setupCamera().then(() => {
      detectFace();
    });

    return () => {
      if (requestAnimationFrameId) cancelAnimationFrame(requestAnimationFrameId);
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [phase, model, socket]);

  // Visibility change (Alt-Tab) detection
  useEffect(() => {
    if (phase !== 'exam') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        socket?.emit('alert', {
          level: 'RED',
          code: 'BROWSER_UNFOCUSED',
          details: 'Student alt-tabbed or minimized the exam window',
        });
        alert('Warning: You navigated away from the exam!');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [phase, socket]);

  const startExam = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed', err);
    }
    setPhase('exam');
    socket?.emit('exam:start');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <Navbar title={phase === 'exam' ? (examCode ? `Room: ${examCode}` : "Exam Focus") : "Terminal"} hideProfile={phase === 'exam'}>
           {examCode && phase !== 'exam' && <div className="text-sm font-mono text-gray-400 mr-2">Room: <span className="text-emerald-400 font-bold">{examCode}</span></div>}
           {sessionId && phase !== 'exam' && <div className="text-sm font-mono text-gray-400 hidden sm:block mr-2">Desk: {sessionId}</div>}
           {phase === 'exam' && (
             <button onClick={handleLeaveExam} disabled={loading} className="ml-4 px-4 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-md hover:bg-red-500 hover:text-white transition-colors text-sm font-bold shadow-lg">
               {loading ? 'Leaving...' : 'Exit Exam'}
             </button>
           )}
      </Navbar>

      <main className="flex-1 flex items-center justify-center p-6">
        
        {phase === 'lobby' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl max-w-md w-full text-center">
            <h1 className="text-3xl font-bold mb-4">Enter Exam Code</h1>
            <p className="text-gray-400 mb-8">Please enter the 6-digit classroom code provided by your Proctor to join the secure session.</p>
            
            <input 
              value={examCodeInput}
              onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. WIN452"
              className="w-full text-center text-3xl font-mono tracking-widest bg-gray-950 border border-gray-800 rounded-lg px-4 py-4 mb-6 focus:outline-none focus:border-emerald-500 transition-colors uppercase"
            />

            <button 
              onClick={handleJoinExam}
              disabled={examCodeInput.length < 3 || loading}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-800 text-white font-bold rounded-lg transition-colors"
            >
              {loading ? 'Joining Securely...' : 'Scan For Network Room 📡'}
            </button>
            <div className="mt-8 text-sm text-gray-500">
               Not taking an exam? <button onClick={signOut} className="text-gray-400 hover:text-red-400 underline transition-colors">Sign out securely</button>
            </div>
          </div>
        )}

        {phase === 'pairing' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-2">Connect Your Private Desk</h1>
            <p className="text-gray-400 mb-8 text-sm">You have securely joined Room <strong>{examCode}</strong>. Now, scan this desk code with your smartphone to bring your camera online.</p>
            
            <div className="bg-white p-4 rounded-xl inline-block mb-8">
              <QRCodeSVG value={`${window.location.origin}/sentinel?sessionId=${sessionId}`} size={200} />
            </div>

            <p className="text-sm text-emerald-400 flex items-center justify-center gap-2">
              <span className="animate-pulse h-2 w-2 bg-emerald-400 rounded-full block"></span>
              Waiting for Bluetooth / Sentinel Ping...
            </p>
          </div>
        )}

        {phase === 'ready' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-emerald-900/50 shadow-xl max-w-md w-full text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse"></div>
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
            <h1 className="text-2xl font-bold mb-2">Dual-Device Sync Complete</h1>
            <p className="text-gray-400 mb-8 text-sm">Your physical environment is now being securely monitored locally. Ensure your phone is leaning against a mug directly facing you.</p>
            
            <button 
              onClick={startExam}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors"
            >
              Begin Exam & Lock Browser
            </button>
          </div>
        )}

        {phase === 'exam' && (
          <div className="w-full max-w-4xl">
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-2xl relative">
              {/* Webcam view */}
              <div className="absolute top-4 right-4 w-48 rounded-lg overflow-hidden border-2 border-gray-800 shadow-lg bg-black z-10">
                <video ref={videoRef} autoPlay playsInline muted className="w-full bg-black transform scale-x-[-1]" />
                {gazeWarning && (
                  <div className="absolute inset-0 border-2 border-yellow-500 bg-yellow-500/20 flex flex-col items-center justify-center">
                    <span className="text-yellow-400 font-bold text-xs uppercase bg-black/80 px-2 py-1 rounded">Face Not Detected</span>
                  </div>
                )}
              </div>

              <div className="p-8 pb-24 border-b border-emerald-900/30">
                <h2 className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">CS101 Final — Room {examCode}</h2>
                <h1 className="text-3xl mb-8 leading-relaxed font-serif">What is the time complexity of a standard Binary Search algorithm?</h1>

                <div className="space-y-4">
                  {['O(n)', 'O(log n)', 'O(n log n)', 'O(n^2)'].map((opt, i) => (
                    <label key={i} className="flex items-center p-5 border border-gray-800 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                      <input type="radio" name="q1" className="mr-5 accent-emerald-500 w-5 h-5" />
                      <span className="text-xl font-mono">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
