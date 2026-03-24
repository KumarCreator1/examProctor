import { useEffect, useState } from 'react';
import { useSocket } from '../components/SocketProvider';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Navbar } from '../components/Navbar';

type SessionFlag = {
  level: string;
  code: string;
  details: string;
  timestamp: number;
};

type Session = {
  sessionId: string;
  studentEmail: string;
  status: 'waiting' | 'paired' | 'active' | 'offline' | 'completed';
  trustScore: number;
  flags: SessionFlag[];
  battery?: number;
  charging?: boolean;
  lastHeartbeat?: number;
};

export default function Dashboard() {
  const { user } = useAuth();
  const socket = useSocket();
  const [examCode, setExamCode] = useState<string | null>(null);
  const [examName, setExamName] = useState('Final Exam');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<'all' | 'clear' | 'warning' | 'flagged' | 'offline' | 'completed'>('all');
  const [loading, setLoading] = useState(true);

  // Industry-Grade Database Recovery: Load the most recently created live exam!
  useEffect(() => {
    if (!user) return;
    
    async function recoverExam() {
      if (!user) return;
      const { data } = await supabase
         .from('exams')
         .select('*')
         .eq('proctor_id', user.id)
         .like('title', '%[Code:%')
         .order('created_at', { ascending: false })
         .limit(1)
         .single();
         
      if (data && data.title) {
        const match = data.title.match(/\[Code:\s*([A-Z0-9]+)\]/);
        if (match && match[1]) {
           // Only reconnect intuitively if it was made in the last 12 hours
           const isRecent = new Date(data.created_at).getTime() > Date.now() - (12 * 60 * 60 * 1000);
           if (isRecent) {
             setExamCode(match[1]);
             setExamName(data.title.replace(/ \[Code:.*\]/, '').trim());
           }
        }
      }
      setLoading(false);
    }
    
    recoverExam();
  }, [user]);

  const createExam = () => {
    if (!socket || !user) return;
    socket.emit('dashboard:create_exam', { examName, proctorId: user.id }, (res: any) => {
      if (res?.ok) {
        setExamCode(res.examCode);
      }
    });
  };

  useEffect(() => {
    if (!socket || !examCode || !user) return;

    // Rehydrate the screen immediately by asking the WebSocket server for all students
    socket.emit('dashboard:subscribe', { examCode, proctorId: user.id }, (res: any) => {
      if (res?.ok && res.sessions) {
        setSessions(res.sessions);
      } else {
        setExamCode(null);
        alert("The live websocket server memory was completely flushed. Please create a new exam room.");
      }
    });

    const onSessionCreated = (session: Session) => {
      setSessions(prev => [...prev, session]);
    };

    const onSessionUpdated = (session: Session) => {
      setSessions(prev => prev.map(s => s.sessionId === session.sessionId ? { ...s, ...session } : s));
    };

    const onSessionRemoved = ({ sessionId }: { sessionId: string }) => {
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    };

    const onAlert = (payload: any) => {
      setSessions(prev => prev.map(s => {
        if (s.sessionId === payload.sessionId) {
          const trustDeduction = payload.level === 'RED' ? 15 : payload.level === 'YELLOW' ? 5 : 0;
          return {
            ...s,
            trustScore: Math.max(0, s.trustScore - trustDeduction),
            flags: [...s.flags, payload]
          };
        }
        return s;
      }));
    };

    const onHeartbeat = (payload: any) => {
      setSessions(prev => prev.map(s => {
        if (s.sessionId === payload.sessionId) {
          return { ...s, battery: payload.battery, charging: payload.charging, lastHeartbeat: payload.timestamp };
        }
        return s;
      }));
    };

    socket.on('session:created', onSessionCreated);
    socket.on('session:updated', onSessionUpdated);
    socket.on('session:removed', onSessionRemoved);
    socket.on('alert', onAlert);
    socket.on('heartbeat', onHeartbeat);

    return () => {
      socket.off('session:created', onSessionCreated);
      socket.off('session:updated', onSessionUpdated);
      socket.off('session:removed', onSessionRemoved);
      socket.off('alert', onAlert);
      socket.off('heartbeat', onHeartbeat);
    };
  }, [socket, examCode]);

  const getSessionStatus = (session: Session) => {
    if (session.status === 'completed') return 'completed';
    if (session.status === 'offline') return 'offline';
    if (session.trustScore < 50 || session.flags.some(f => f.level === 'RED')) return 'flagged';
    if (session.trustScore < 90 || session.flags.some(f => f.level === 'YELLOW')) return 'warning';
    return 'clear';
  };

  const filteredSessions = sessions.filter(s => {
    if (filter === 'all') return true;
    return getSessionStatus(s) === filter;
  });

  const counts = {
    all: sessions.length,
    clear: sessions.filter(s => getSessionStatus(s) === 'clear').length,
    warning: sessions.filter(s => getSessionStatus(s) === 'warning').length,
    flagged: sessions.filter(s => getSessionStatus(s) === 'flagged').length,
    offline: sessions.filter(s => getSessionStatus(s) === 'offline').length,
    completed: sessions.filter(s => getSessionStatus(s) === 'completed').length,
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-emerald-500 font-mono tracking-widest uppercase animate-pulse">Restoring Dashboard...</div>;
  }

  if (!examCode) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl text-center">
          <h2 className="text-3xl font-bold mb-4"><span className="text-emerald-400">Integrity</span> Host</h2>
          <p className="text-gray-400 mb-8">Create a new Live Exam Room below. Share the unique generated code with your students so they can join.</p>
          
          <input 
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            placeholder="e.g. Biology 101 Midterm"
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 mb-6 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button 
            onClick={createExam}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors"
          >
            Create Infinite Exam Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex flex-col">
      <Navbar title={examCode ? `Room: ${examCode}` : "Proctor Dashboard"}>
        {examCode && (
          <button 
            onClick={() => {
               if(window.confirm("Close this exam room entirely?")) {
                  socket?.emit('dashboard:end_exam', { examCode });
                  setExamCode(null);
               }
            }} 
            className="ml-4 px-3 py-1.5 bg-gray-900 border border-red-500/30 hover:bg-red-500 hover:text-white text-red-400 font-medium rounded-md transition-colors text-sm"
          >
            End Exam
          </button>
        )}
      </Navbar>

      <main className="flex-1 p-6 flex flex-col items-center justify-center">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
           <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-lg flex flex-col justify-between">
             <div className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2"><span>👥</span> Total Inside Room</div>
             <div className="text-3xl font-mono text-white">{counts.all}</div>
           </div>
           <div className="bg-gray-900 border border-emerald-900/30 p-5 rounded-xl shadow-lg flex flex-col justify-between">
             <div className="text-emerald-500 text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2"><span>✅</span> Clear Status</div>
             <div className="text-3xl font-mono text-emerald-400">{counts.clear}</div>
           </div>
           <div className="bg-gray-900 border border-yellow-900/30 p-5 rounded-xl shadow-lg flex flex-col justify-between">
             <div className="text-yellow-500 text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2"><span>⚠️</span> Warnings Issued</div>
             <div className="text-3xl font-mono text-yellow-500">{counts.warning}</div>
           </div>
           <div className="bg-gray-900 border border-red-900/30 p-5 rounded-xl shadow-lg flex flex-col justify-between">
             <div className="text-red-500 text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2"><span>🚨</span> Red Flags</div>
             <div className="text-3xl font-mono text-red-500">{counts.flagged}</div>
           </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-800 pb-4">
           {(['all', 'clear', 'warning', 'flagged', 'offline', 'completed'] as const).map(f => (
             <button 
               key={f}
               onClick={() => setFilter(f as typeof filter)}
               className={`px-5 py-2.5 rounded-md text-sm font-bold shadow-md capitalize transition-colors ${
                 filter === f 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
               }`}
             >
               {f} ({counts[f]})
             </button>
           ))}
        </div>

        {/* Student Grid Area */}
        {filteredSessions.length === 0 ? (
          <div className="w-full text-center p-16 border border-dashed border-gray-800 bg-gray-900/50 rounded-2xl text-gray-500 flex flex-col items-center justify-center">
            <span className="text-4xl mb-4 opacity-50">👥</span>
            <p className="text-lg font-medium text-gray-400">Share your Exam Code above with your students!</p>
            <p className="text-sm mt-2 opacity-60">As soon as they type it in, they will populate securely right here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredSessions.map(session => {
              const status = getSessionStatus(session);
              const statusColor = status === 'clear' ? 'bg-emerald-500' : status === 'warning' ? 'bg-yellow-500' : status === 'completed' ? 'bg-blue-500' : status === 'offline' ? 'bg-gray-500' : 'bg-red-500';
              const borderColor = status === 'clear' ? 'border-emerald-500/20' : status === 'warning' ? 'border-yellow-500/50' : status === 'completed' ? 'border-blue-500/50' : status === 'offline' ? 'border-gray-500/50' : 'border-red-500';
              
              return (
                <div key={session.sessionId} className={`bg-gray-900 rounded-xl p-5 border ${borderColor} shadow-lg relative overflow-hidden flex flex-col ${(status === 'offline' || status === 'completed') ? 'opacity-60 saturate-50' : ''}`}>
                  <div className={`absolute top-0 left-0 w-full h-1 ${statusColor}`}></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-lg font-bold truncate max-w-[200px]">{session.studentEmail}</div>
                      <div className="text-xs text-gray-400 capitalize bg-gray-950 inline-block px-2 py-1 rounded mt-1 border border-gray-800 uppercase tracking-widest font-mono text-[10px]">
                        {session.status} • DESK: {session.sessionId}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-2xl font-mono font-bold leading-none ${status === 'clear' ? 'text-emerald-400' : status === 'warning' ? 'text-yellow-400' : 'text-red-400'}`}>
                        {session.trustScore}%
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Trust Score</div>
                    </div>
                  </div>

                  {/* Device Status */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm bg-gray-950 p-3 rounded-lg border border-gray-800">
                     <div>
                      <span className="text-gray-500 block text-xs mb-1">Battery (Phone)</span>
                      <span className={`${session.battery && session.battery < 20 && !session.charging ? 'text-red-400' : 'text-gray-300'} font-mono`}>
                        {session.battery !== undefined ? `${session.battery}% ${session.charging ? '⚡' : ''}` : '---'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-xs mb-1">Camera Ping</span>
                      <span className="text-gray-300 font-mono">
                        {session.lastHeartbeat ? `${Math.floor((Date.now() - session.lastHeartbeat) / 1000)}s ago` : '---'}
                      </span>
                    </div>
                  </div>

                  {/* Flags Log */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-bold flex justify-between">
                       <span>Recent Alerts</span>
                       <span>{session.flags.length} total</span>
                    </div>
                    {session.flags.length === 0 ? (
                      <div className="text-sm text-gray-600 italic">No anomalies detected natively.</div>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                        {[...session.flags].reverse().map((flag, idx) => (
                          <div key={idx} className={`text-xs p-2 rounded border ${flag.level === 'RED' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'}`}>
                            <div className="font-bold flex justify-between">
                               <span>{flag.code}</span>
                               <span className="opacity-50 text-[10px]">{new Date(flag.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {flag.details && <div className="opacity-80 mt-0.5 leading-snug">{flag.details}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  );
}
