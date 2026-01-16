import { useSelectedentryId } from "./SelectedEntryIdContext";
import { useSelectedEntry } from "./SelectedEntryContext";
import { useState, useEffect, useContext } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { UserIdContext} from "./UserIdContext";
import { API_BASE } from "../config/api";

const Transcript = () => {
  const [transcript, setTranscript] = useState("CLICK ON ANY ENTRY TO VIEW IT!👆");
  const {selectedentryId} = useSelectedentryId();
  const {selectedEntry} = useSelectedEntry();
  const { token } = useAuth();
  const {userId} = useContext(UserIdContext);

  useEffect(() => {
    // Use entry data directly from context (instant, no API call needed)
    if (selectedEntry && selectedEntry.id === selectedentryId) {
      const entryTranscript = selectedEntry.transcript;
      
      if (entryTranscript && entryTranscript.trim() !== '') {
        setTranscript(entryTranscript);
      } else {
        setTranscript('No transcript available for this entry.');
      }
    } else if (!selectedentryId) {
      // Reset to default message if no entry selected
      setTranscript("CLICK ON ANY ENTRY TO VIEW IT!👆");
    } else if (selectedentryId && (!selectedEntry || selectedEntry.id !== selectedentryId)) {
      // Fallback: entry data not in context, fetch from API (should rarely happen)
      const fetchEntry = async () => {
        if (!userId || !token || !selectedentryId) return;
        
        const numericUserId = typeof userId === 'string' && userId.includes('-') 
          ? null 
          : parseInt(userId, 10);
        
        if (!numericUserId || isNaN(numericUserId)) return;
        
        try {
          const response = await axios.get(
            API_BASE + '/users/' + numericUserId + '/entries/' + selectedentryId,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          const entryTranscript = response.data.data.entry.transcript;
          if (entryTranscript && entryTranscript.trim() !== '') {
            setTranscript(entryTranscript);
          } else {
            setTranscript('No transcript available for this entry.');
          }
        } catch (error) {
          console.error('Error fetching transcript (fallback):', error);
          setTranscript('Error loading transcript. Please try again.');
        }
      };
      
      fetchEntry();
    }
  }, [selectedEntry, selectedentryId, userId, token]);

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 h-[calc(100vh-200px)] flex flex-col">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-800">
        <h2 className="text-xl font-bold text-white">Transcript</h2>
        <p className="text-sm text-slate-300 mt-1">View the full transcript of your selected journal entry</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {transcript === "CLICK ON ANY ENTRY TO VIEW IT!👆" || !selectedentryId ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 border-2 border-slate-200">
              <span className="text-4xl">📄</span>
            </div>
            <p className="text-slate-700 font-semibold text-lg">No entry selected</p>
            <p className="text-sm text-slate-500 mt-2">Click on any journal entry from the list above to view its transcript</p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-8">
            <div className="mb-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-slate-600">Full Transcript</span>
            </div>
            <div className="prose prose-lg max-w-none">
              <p className="text-slate-800 leading-relaxed whitespace-pre-wrap text-base">
                {transcript}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


export default Transcript;
