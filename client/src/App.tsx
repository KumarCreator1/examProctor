import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { SocketProvider } from "./components/SocketProvider";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import Terminal from "./pages/Terminal";
import Login from "./pages/Login";
import Sentinel from "./pages/Sentinel";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";

// Protect routes that require authentication
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
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
            <Route path="/terminal" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
            <Route path="/sentinel" element={<ProtectedRoute><Sentinel /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
