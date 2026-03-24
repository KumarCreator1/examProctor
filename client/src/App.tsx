import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { SocketProvider } from "./components/SocketProvider";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import Terminal from "./pages/Terminal";
import Login from "./pages/Login";
import Sentinel from "./pages/Sentinel";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import Profile from "./pages/Profile";

// Protect routes that require authentication
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) return <div className="p-8 flex items-center justify-center text-emerald-400 font-mono tracking-widest min-h-screen bg-gray-950 uppercase text-xs">Decrypting Handshake...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <>{children}</>;
};

const ProctorRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 flex items-center justify-center text-emerald-400 font-mono tracking-widest min-h-screen bg-gray-950 uppercase text-xs">Decrypting Handshake...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== 'proctor') return <Navigate to="/terminal" replace />;
  return <>{children}</>;
};

const StudentRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 flex items-center justify-center text-emerald-400 font-mono tracking-widest min-h-screen bg-gray-950 uppercase text-xs">Decrypting Handshake...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== 'student') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/terminal" element={<StudentRoute><Terminal /></StudentRoute>} />
            <Route path="/sentinel" element={<StudentRoute><Sentinel /></StudentRoute>} />
            <Route path="/dashboard" element={<ProctorRoute><Dashboard /></ProctorRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
