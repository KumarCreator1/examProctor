import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';

interface NavbarProps {
  title?: string;
  children?: React.ReactNode;
  hideProfile?: boolean;
}

export function Navbar({ title = "Terminal", children, hideProfile = false }: NavbarProps) {
    const { profile, user, signOut } = useAuth();
    
    // Construct avatar fallback letter
    const fallbackLetter = profile?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?';
    // Use Supabase public URL if avatar_url exists
    const avatarUrl = profile?.avatar_url ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatar_url}` : null;

    return (
      <nav className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900 sticky top-0 z-50">
        <div className="flex items-center gap-6">
           <div className="font-bold text-xl tracking-tight flex items-center gap-2">
             <span className="text-emerald-400">Integrity</span> 
             <span className="text-gray-500 font-light text-xl">|</span>
             <span className="text-gray-100">{title}</span>
           </div>
           <div className="hidden sm:flex items-center gap-4">
               {children}
           </div>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Allow external injection of action buttons (like Exit Exam) before the identity dropdown */}
           <div className="sm:hidden flex">
               {children}
           </div>

           {!hideProfile && (
             <div className="group relative">
                <button className="flex items-center gap-2 hover:bg-gray-800 p-1.5 rounded-full transition-colors focus:outline-none border border-transparent hover:border-gray-700">
                   {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-gray-700" />
                   ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-emerald-400 border border-gray-700">
                         {fallbackLetter}
                      </div>
                   )}
                </button>
                
                <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                   <div className="p-4 border-b border-gray-800 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full mb-3 shadow-inner bg-gray-800 flex items-center justify-center text-xl font-bold text-emerald-400 border border-gray-700 overflow-hidden">
                         {avatarUrl ? <img src={avatarUrl} alt="Hero" className="w-full h-full object-cover" /> : fallbackLetter}
                      </div>
                      <p className="text-sm text-white font-bold w-full truncate">{profile?.full_name || 'Admin User'}</p>
                      <p className="text-xs text-gray-400 w-full truncate font-mono mt-0.5">{user?.email}</p>
                   </div>
                   <div className="p-1">
                      <Link to="/profile" className="block px-3 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">Settings & Profile</Link>
                      <button onClick={signOut} className="w-full text-left px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors mt-1">Log Out API</button>
                   </div>
                </div>
             </div>
           )}
        </div>
      </nav>
    );
}
