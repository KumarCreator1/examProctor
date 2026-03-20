import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocket } from '../components/SocketProvider';
import { Html5QrcodeScanner } from 'html5-qrcode';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

type Phase = 'scanning' | 'positioning' | 'monitoring';

export default function Sentinel() {
  const socket = useSocket();
  const [searchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId') || '';
  const [phase, setPhase] = useState<Phase>(initialSessionId ? 'positioning' : 'scanning');
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load COCO-SSD Model
  useEffect(() => {
    async function loadModel() {
      await tf.ready();
      const loadedModel = await cocoSsd.load();
      setModel(loadedModel);
    }
    loadModel();
  }, []);

  // QR Code Scanner Logic
  useEffect(() => {
    if (phase !== 'scanning') return;

    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        // Handle full URL from Terminal component (e.g. http://localhost:5173/sentinel?sessionId=XYZ)
        try {
          const url = new URL(decodedText);
          const scannedId = url.searchParams.get('sessionId');
          if (scannedId) {
            setSessionId(scannedId);
            scanner.clear();
            setPhase('positioning');
          }
        } catch (e) {
          // If the QR is just the raw ID string
          setSessionId(decodedText);
          scanner.clear();
          setPhase('positioning');
        }
      },
      (_error) => {
        // Silently ignore scan noise
      }
    );

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [phase]);

  // Join Session via Socket
  useEffect(() => {
    if (phase === 'positioning' && sessionId && socket) {
      socket.emit('session:join', { sessionId }, (res: any) => {
        if (!res.ok) {
          alert('Failed to join session: ' + res.error);
          setPhase('scanning');
        }
      });
    }
  }, [phase, sessionId, socket]);

  // Setup Camera for Positioning & Monitoring
  useEffect(() => {
    if ((phase === 'positioning' || phase === 'monitoring') && model) {
      let requestAnimationFrameId: number;

      async function setupCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
            });
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (e) {
            console.error('Camera access denied or failed.', e);
          }
        }
      }

      async function detectObjects() {
        if (videoRef.current && videoRef.current.readyState === 4 && phase === 'monitoring') {
          const predictions = await model!.detect(videoRef.current);
          
          let alertTriggered = false;
          let detectedObject = '';

          // Look for unauthorized objects (using COCO-SSD classes)
          predictions.forEach(pred => {
            if (pred.class === 'cell phone' || pred.class === 'book' || pred.class === 'laptop') {
              alertTriggered = true;
              detectedObject = pred.class;
            }
          });

          // Trigger alerting logic through the WebSocket relay
          if (alertTriggered && socket) {
             socket.emit('alert', {
                level: 'RED',
                code: 'OBJECT_DETECTED',
                details: `Detected unauthorized object: ${detectedObject}`
             });
          }

          // Optional UX: Draw bounding boxes for visual verification locally
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
              predictions.forEach(pred => {
                ctx.beginPath();
                ctx.rect(pred.bbox[0], pred.bbox[1], pred.bbox[2], pred.bbox[3]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = (pred.class === 'cell phone' || pred.class === 'book' || pred.class === 'laptop') ? 'red' : 'green';
                ctx.stroke();
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = '12px Courier New';
                ctx.fillText(`${pred.class} (${Math.round(pred.score * 100)}%)`, pred.bbox[0], pred.bbox[1] > 10 ? pred.bbox[1] - 5 : 10);
              });
            }
          }
        }
        requestAnimationFrameId = requestAnimationFrame(detectObjects);
      }

      setupCamera().then(() => {
        detectObjects();
      });

      return () => {
        if (requestAnimationFrameId) cancelAnimationFrame(requestAnimationFrameId);
        if (videoRef.current?.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
      };
    }
  }, [phase, model, socket]);

  // Battery and Heartbeat Loop
  useEffect(() => {
    if (phase !== 'monitoring' || !socket) return;
    
    const interval = setInterval(async () => {
      let batteryLevel = 100;
      let charging = false;

      const nav = navigator as any;
      if (nav.getBattery) {
        try {
          const battery = await nav.getBattery();
          batteryLevel = Math.round(battery.level * 100);
          charging = battery.charging;
        } catch (e) {
          // Fallback if unsupported
        }
      }

      socket.emit('heartbeat', {
        battery: batteryLevel,
        charging,
        status: batteryLevel < 15 && !charging ? 'BATTERY_LOW' : 'CLEAR'
      });
    }, 5000); // 5s pulse per PRD

    return () => clearInterval(interval);
  }, [phase, socket]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <nav className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
        <div className="font-bold text-xl tracking-tight">
          <span className="text-emerald-400">Integrity</span> Sentinel
        </div>
        <div className="text-sm font-mono text-gray-400">Session: {sessionId || 'Unpaired'}</div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        {phase === 'scanning' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl max-w-sm w-full">
            <h1 className="text-2xl font-bold mb-2">Scan QR Code</h1>
            <p className="text-gray-400 mb-6 text-sm">Scan the code on your laptop screen to pair this device.</p>
            
            <div id="reader" className="w-full bg-white text-black rounded-lg overflow-hidden border border-gray-700"></div>
          </div>
        )}

        {phase === 'positioning' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl max-w-sm w-full flex flex-col items-center">
            <h1 className="text-2xl font-bold mb-2">Position Device</h1>
            <p className="text-gray-400 mb-6 text-sm">Lean your phone against a mug for a top-down view of your desk setup.</p>
            
            <div className="relative rounded-xl border-2 border-dashed border-emerald-500/50 aspect-video w-full mb-6 overflow-hidden bg-black/50">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border border-emerald-500/80 w-32 h-20 rounded bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-[10px] font-mono text-emerald-300">DESK AREA</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setPhase('monitoring')}
              disabled={!model}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold rounded-lg transition-colors flex justify-center items-center"
            >
              {model ? 'Confirm Position' : 'Loading AI Engine...'}
            </button>
          </div>
        )}

        {phase === 'monitoring' && (
          <div className="bg-gray-900 p-8 rounded-2xl border border-emerald-900 shadow-xl max-w-sm w-full relative overflow-hidden flex flex-col items-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
            
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 text-3xl">✓</div>
            <h1 className="text-2xl font-bold mb-2">Monitoring Active</h1>
            <p className="text-gray-400 mb-6 text-sm">Do not close this tab or move your phone. Your environment is being analyzed locally.</p>
            
            <div className="relative rounded-xl border border-gray-800 aspect-video w-full mb-6 overflow-hidden bg-black">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay playsInline muted />
              <canvas ref={canvasRef} width={640} height={480} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
            </div>

            <div className="bg-gray-950 w-full rounded-lg p-3 text-left">
               <div className="flex justify-between items-center text-sm border-b border-gray-800 pb-2 mb-2">
                 <span className="text-gray-400">AI Engine</span>
                 <span className="text-emerald-400 font-mono">COCO-SSD</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-400">Uplink Status</span>
                 <span className="text-emerald-400 font-mono flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active
                 </span>
               </div>
            </div>
            <p className="text-xs text-gray-500 mt-6 text-center">
              Processing occurs strictly on this device to protect your privacy. Zero webcams are streamed to the cloud.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
