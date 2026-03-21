import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const isNgrok = window.location.protocol === 'https:' || window.location.hostname.includes('ngrok');
const ENV_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;
// FORCE window.location.origin if served via Ngrok/HTTPS to completely override static dev .env files
const socketUrl = isNgrok ? window.location.origin : (ENV_URL || 'http://localhost:3001');

const SocketContext = createContext<Socket | null>(null);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      extraHeaders: {
        "ngrok-skip-browser-warning": "69420"
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
