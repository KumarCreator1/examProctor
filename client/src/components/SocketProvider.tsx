import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const ENV_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;
// Use explicit ENV variable if provided, otherwise fallback appropriately
const socketUrl = ENV_URL || (window.location.hostname.includes('ngrok') ? window.location.origin : 'http://localhost:3001');

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
