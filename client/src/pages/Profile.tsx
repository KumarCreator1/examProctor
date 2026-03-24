import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../components/AuthProvider";
import { Navbar } from "../components/Navbar";

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  async function updateProfile() {
    if (!user) return;
    try {
      setLoading(true);
      const updates = {
        id: user.id,
        full_name: fullName,
        avatar_url: avatarUrl,
        updated_at: new Date(),
      };

      const { error } = await supabase.from("profiles").upsert(updates);
      if (error) throw error;
      
      await refreshProfile();
      alert("Profile securely updated!");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error("You must select an image to upload.");
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);

      if (uploadError) throw uploadError;
      
      setAvatarUrl(filePath);
      // Auto-save the update
      const { error: updateError } = await supabase.from("profiles").upsert({
          id: user?.id,
          avatar_url: filePath,
          updated_at: new Date()
      });
      if (updateError) throw updateError;
      
      await refreshProfile();

    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <Navbar title="Settings" />

      <main className="flex-1 max-w-2xl w-full mx-auto p-6 md:p-12">
        <div className="mb-8">
            <Link to={user?.user_metadata.role === 'proctor' ? '/dashboard' : '/terminal'} className="text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center gap-2 mb-4">
                ← Back to Portal
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Account Configuration</h1>
            <p className="text-gray-400 mt-2 text-sm">Manage your demographic details and biometric avatar used for visual identification across the platform.</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8 overflow-hidden relative">
            
          <div className="flex flex-col sm:flex-row items-center gap-8 mb-8 pb-8 border-b border-gray-800">
             <div className="relative group">
                {avatarUrl ? (
                   <img src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`} className="w-32 h-32 rounded-full object-cover border-4 border-gray-800 shadow-xl" alt="Profile" />
                ) : (
                   <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center text-4xl font-bold text-gray-500 border-4 border-gray-900 shadow-xl">
                      {fullName ? fullName.charAt(0).toUpperCase() : '?'}
                   </div>
                )}
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-xs font-bold tracking-widest text-white uppercase">Upload</span>
                    <input 
                      type="file" 
                      id="single" 
                      accept="image/*" 
                      onChange={uploadAvatar} 
                      disabled={uploading} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
             </div>
             <div>
                <h3 className="text-xl font-bold text-white mb-1">Avatar Graphic</h3>
                <p className="text-gray-400 text-sm max-w-xs">{uploading ? 'Processing local upload...' : 'Click your avatar to upload a professional, clear photograph representing your real-world identity.'}</p>
             </div>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">Registered Email Address</label>
              <input id="email" type="text" value={user?.email || ""} disabled className="w-full bg-gray-950 border border-gray-800 py-3 px-4 rounded-xl text-gray-500 font-mono text-sm cursor-not-allowed" />
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-400 mb-2">Full Legal Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Steve Jobs"
                className="w-full bg-gray-950 border border-gray-700 py-3 px-4 rounded-xl text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm font-medium placeholder-gray-600"
              />
            </div>
            
            <div className="pt-4">
              <button
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold tracking-wide rounded-xl transition-colors flex items-center justify-center relative overflow-hidden group disabled:opacity-50"
                onClick={updateProfile}
                disabled={loading}
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <span className="relative z-10">{loading ? 'Encrypting Payload...' : 'Save Configuration Parameters'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
