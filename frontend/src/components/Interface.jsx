import { useAuth } from "../contexts/AuthContext";
import { useEffect, useContext } from "react";
import { UserIdContext} from "./UserIdContext"
import Transcript from "./Transcript";
import EntryList from "./EntryList";
import Logout from "./Logout";

const Sidebar = () => {
  const { user, token } = useAuth();
  const { userId, setUserId } = useContext(UserIdContext);

  // Set userId from authenticated user
  useEffect(() => {
    if (user && user.id) {
      // Set userId directly from user.id (can be UUID or numeric)
      // Backend will handle conversion via JWT token
      setUserId(user.id);
      console.log('User ID set:', user.id);
    }
  }, [user, setUserId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 shadow-lg border-b border-slate-600">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md border border-blue-500/30">
              <span className="text-white font-bold text-2xl">J</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Journal Ease</h1>
              <p className="text-sm text-slate-300">
                {`Welcome back, ${user?.name || 'User'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right bg-slate-700/50 backdrop-blur-sm px-4 py-2 rounded-lg border border-slate-600">
              <p className="text-sm font-medium text-white">{user?.email}</p>
              <p className="text-xs text-slate-300">Signed in</p>
            </div>
            <Logout />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Top Section - Recording Controls */}
        <EntryList showRecordingControls={true} />
        
        <div className="mt-6">
          {/* Transcript Panel - Full Width */}
          <Transcript />
        </div>
      </div>
    </div>
  );
} 

export default Sidebar;
