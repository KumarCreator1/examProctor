import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<'student'|'proctor'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let authError = null;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role
          }
        }
      });
      authError = error;
      
      if (!error && data?.user && role === 'proctor') {
         await supabase.from('profiles').update({ role: 'proctor' }).eq('id', data.user.id);
      }
      
      if (!error) {
        alert('Account created! If Supabase Auto-Confirm is disabled, you must click Sign In manually.');
        setIsSignUp(false);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      authError = error;
      if (!error && data?.user) {
        // Find their intended role from metadata
        let userRole = data.user.user_metadata?.role || 'student';
        
        // As a fallback, check if they manually upgraded their DB profile directly
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
        if (profile?.role === 'proctor') {
            userRole = 'proctor';
        }
        
        const returnUrl = location.state?.from as string | undefined;

        if (userRole === 'proctor') {
          if (returnUrl === '/terminal' || returnUrl === '/sentinel') {
            navigate('/dashboard');
          } else {
            navigate(returnUrl || '/dashboard');
          }
        } else {
          if (returnUrl === '/dashboard') {
            navigate('/terminal');
          } else {
            navigate(returnUrl || '/terminal');
          }
        }
      }
    }

    if (authError) {
      setError(authError.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl text-white">
        <h2 className="text-3xl font-bold mb-2 text-center">
          <span className="text-emerald-400">Integrity</span> {isSignUp ? 'SignUp' : 'SignIn'}
        </h2>
        <p className="text-gray-400 text-center mb-8">
          {isSignUp ? 'Create a test account' : 'Secure Proctoring Access'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">I am a...</label>
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value as 'student'|'proctor')}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors text-white"
              >
                <option value="student">Student</option>
                <option value="proctor">Proctor</option>
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="proctor@university.edu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 text-white font-bold rounded-lg transition-colors mt-4"
          >
            {loading ? 'Authenticating...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-emerald-400 hover:text-emerald-300 font-medium"
          >
            {isSignUp ? 'Sign In instead' : 'Create a test account'}
          </button>
        </div>
      </div>
    </div>
  );
}
