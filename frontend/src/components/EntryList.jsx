import { useEntryId } from "./EntryIdContext";
import { UserIdContext} from "./UserIdContext";
import { useSelectedentryId } from "./SelectedEntryIdContext";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { useState, useEffect, useContext, useRef } from "react";
import Audio from "./Audio";
import { API_BASE } from "../config/api";
import { useScript } from "./ScriptContext";

const EntryList = ({ showRecordingControls = false }) => {
    const { userId } = useContext(UserIdContext);
    const { token } = useAuth();
    const [entries, setEntries] = useState([]);
    const [popupActive, setPopupActive] = useState(false);
    const {script, setScript} = useScript();
    const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
    const [recordingData, setRecordingData] = useState({ duration_ms: null, local_path: null });
    const [expandedDays, setExpandedDays] = useState(new Set()); // Track which days are expanded
    const [editingEntryId, setEditingEntryId] = useState(null); // Track which entry's date is being edited
    const [editJournalDate, setEditJournalDate] = useState("");

    // Group entries by journal_date
    const groupEntriesByDate = (entries) => {
        const grouped = {};
        entries.forEach(entry => {
            const date = entry.journal_date || entry.created_at.split('T')[0];
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(entry);
        });
        
        // Sort entries within each day by created_at (chronological)
        Object.keys(grouped).forEach(date => {
            grouped[date].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
        
        // Sort dates in descending order (newest first)
        return Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)).reduce((acc, date) => {
            acc[date] = grouped[date];
            return acc;
        }, {});
    };

    // Get merged transcript for a day
    const getMergedTranscript = (dayEntries) => {
        return dayEntries
            .map(entry => entry.transcript || '')
            .filter(t => t.trim() !== '')
            .join('\n\n');
    };

    // Get summary snippet (first line) for a day
    const getSummarySnippet = (dayEntries) => {
        const firstEntry = dayEntries[0];
        if (!firstEntry || !firstEntry.transcript) return 'No transcript available';
        const firstLine = firstEntry.transcript.split('\n')[0];
        return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    };

    const getEntries = async(userId) => {
        if (!userId || !token) return;
        try {
            const response = await axios.get(
                API_BASE + '/users/' + userId +'/entries',
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const entries_data = response.data.data.entries;
            setEntries(entries_data);
            
            // Auto-expand today's date
            const today = new Date().toISOString().split('T')[0];
            setExpandedDays(new Set([today]));
        } catch (error) {
            console.error('Error:', error);
        }
    };

    useEffect(() => {
        getEntries(userId);
    }, [userId]);

    const handleCreateEntry = async(e) => {
        e.preventDefault();
        if (!userId || !token) return;
        if (!script || script.trim() === '') {
            alert('Please record a journal entry first');
            return;
        }
        
        try {
            const response = await axios.post(
                API_BASE + '/users/' + userId + '/entries',
                {
                    transcript: script,
                    duration_ms: recordingData.duration_ms,
                    local_path: recordingData.local_path,
                    journal_date: journalDate,
                    transcript_id: null,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const newEntryData = response.data.data.entry;
            
            // Save transcript to transcripts table if we have a transcript
            if (script && script.trim() !== '' && newEntryData.id) {
                try {
                    await axios.post(
                        API_BASE + '/transcripts',
                        {
                            recording_id: newEntryData.id,
                            text: script,
                            language: null, // Can be added later if needed
                            confidence: null, // Can be added later if needed
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                            },
                        }
                    );
                    // Update entry with transcript_id
                    const transcriptResponse = await axios.get(
                        API_BASE + '/recordings/' + newEntryData.id + '/transcript',
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                            },
                        }
                    );
                    if (transcriptResponse.data.data.transcript) {
                        await axios.patch(
                            API_BASE + '/users/' + userId + '/entries/' + newEntryData.id,
                            { transcript_id: transcriptResponse.data.data.transcript.id },
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );
                    }
                } catch (transcriptError) {
                    console.error('Error saving transcript:', transcriptError);
                    // Don't fail the whole process if transcript saving fails
                }
            }
            
            // Update entries and expand the date
            setEntries((entries) => [newEntryData, ...entries]);
            setExpandedDays(prev => new Set([...prev, journalDate]));
            
            // Reset form
            setScript("");
            setJournalDate(new Date().toISOString().split('T')[0]);
            setRecordingData({ duration_ms: null, local_path: null });
            
            // Close the popup
            setPopupActive(false);
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to save journal entry. Please try again.');
        }
    };

    const handleRecordingComplete = (data) => {
        setRecordingData({
            duration_ms: data.duration_ms,
            local_path: data.local_path,
        });
    };

    const toggleDay = (date) => {
        setExpandedDays(prev => {
            const newSet = new Set(prev);
            if (newSet.has(date)) {
                newSet.delete(date);
            } else {
                newSet.add(date);
            }
            return newSet;
        });
    };

    const handleUpdateJournalDate = async (entryId, newDate) => {
        if (!userId || !token) return;
        try {
            const response = await axios.patch(
                API_BASE + '/users/' + userId + '/entries/' + entryId,
                { journal_date: newDate },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            
            // Refresh entries
            await getEntries(userId);
            setEditingEntryId(null);
        } catch (error) {
            console.error('Error updating date:', error);
            alert('Failed to update journal date');
        }
    };

    const groupedEntries = groupEntriesByDate(entries);
    const totalEntries = entries.length;

    return (
        <>
            {/* Top Section - Recording Controls */}
            {showRecordingControls && (
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                        {/* Date Picker */}
                        <div className="flex-1">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Journal Date
                            </label>
                            <input
                                type="date"
                                value={journalDate}
                                onChange={(e) => setJournalDate(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        {/* Record Button and Timer */}
                        <div className="flex-1">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Record New Entry
                            </label>
                            <Audio onRecordingComplete={handleRecordingComplete} showTimer={true} />
                        </div>

                        {/* Save Button */}
                        <div className="flex items-end">
                            <button
                                onClick={() => {
                                    if (script && script.trim() !== '') {
                                        handleCreateEntry({ preventDefault: () => {} });
                                    } else {
                                        setPopupActive(true);
                                    }
                                }}
                                disabled={!script || script.trim() === ''}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Entry
                            </button>
                        </div>
                    </div>

                    {/* Transcript Preview */}
                    {script && (
                        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                            <p className="text-sm font-semibold text-slate-700 mb-2">Transcript Preview:</p>
                            <p className="text-sm text-slate-800">{script.substring(0, 200)}{script.length > 200 ? '...' : ''}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Journal Entries List - Grouped by Date */}
            <div className="bg-white rounded-lg shadow-md border border-slate-200 h-[calc(100vh-140px)] flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">My Journals</h2>
                        <p className="text-sm text-slate-600 font-medium mt-1">{totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}</p>
                    </div>
                    {!showRecordingControls && (
                        <button 
                            onClick={() => setPopupActive(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
                        >
                            <span className="text-lg">+</span>
                            <span>New Entry</span>
                        </button>
                    )}
                </div>

                {/* Entries List - Grouped by Date */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                    {totalEntries === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-12">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 border-2 border-slate-200">
                                <span className="text-4xl">📝</span>
                            </div>
                            <p className="text-slate-700 font-semibold text-lg">No journal entries yet</p>
                            <p className="text-sm text-slate-500 mt-1">Record your first entry to get started</p>
                        </div>
                    ) : (
                        Object.keys(groupedEntries).map((date) => {
                            const dayEntries = groupedEntries[date];
                            const isExpanded = expandedDays.has(date);
                            const mergedTranscript = getMergedTranscript(dayEntries);
                            const summarySnippet = getSummarySnippet(dayEntries);
                            
                            return (
                                <DayGroup
                                    key={date}
                                    date={date}
                                    entries={dayEntries}
                                    isExpanded={isExpanded}
                                    onToggle={() => toggleDay(date)}
                                    summarySnippet={summarySnippet}
                                    mergedTranscript={mergedTranscript}
                                    onEntriesChange={setEntries}
                                    onRefresh={() => getEntries(userId)}
                                    editingEntryId={editingEntryId}
                                    setEditingEntryId={setEditingEntryId}
                                    editJournalDate={editJournalDate}
                                    setEditJournalDate={setEditJournalDate}
                                    onUpdateDate={handleUpdateJournalDate}
                                    userId={userId}
                                    token={token}
                                />
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal for Recording (if not using top section) */}
            {!showRecordingControls && popupActive && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-800 rounded-t-lg flex items-center justify-between">
                            <h3 className="text-2xl font-bold text-white">Record Your Journal</h3>
                            <button 
                                onClick={() => setPopupActive(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors text-white"
                            >
                                <span className="text-xl font-bold">×</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-6">
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Journal Date
                                </label>
                                <input
                                    type="date"
                                    value={journalDate}
                                    onChange={(e) => setJournalDate(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    max={new Date().toISOString().split('T')[0]}
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Record Audio
                                </label>
                                <Audio onRecordingComplete={handleRecordingComplete} />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Transcript Preview
                                </label>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
                                    {script ? (
                                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{script}</p>
                                    ) : (
                                        <p className="text-slate-400 italic">Your transcript will appear here after recording...</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-end gap-3">
                            <button 
                                onClick={() => setPopupActive(false)}
                                className="px-4 py-2 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors border border-slate-300"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreateEntry}
                                disabled={!script || script.trim() === ''}
                                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Save Journal Entry
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// Day Group Component
const DayGroup = ({ 
    date, 
    entries, 
    isExpanded, 
    onToggle, 
    summarySnippet, 
    mergedTranscript,
    onEntriesChange,
    onRefresh,
    editingEntryId,
    setEditingEntryId,
    editJournalDate,
    setEditJournalDate,
    onUpdateDate,
    userId,
    token,
}) => {
    const formatDateHeader = (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (dateString === today.toISOString().split('T')[0]) {
            return 'Today';
        } else if (dateString === yesterday.toISOString().split('T')[0]) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
    };

    // Derive a simple aggregated sync status for the day
    const getDaySyncStatus = () => {
        if (!entries || entries.length === 0) return 'not_configured';
        const statuses = new Set(
            entries.map(e => e.sync_status || 'not_configured')
        );
        if (statuses.has('sync_failed')) return 'sync_failed';
        if (statuses.has('pending')) return 'pending';
        if (statuses.has('synced')) return 'synced';
        if (statuses.has('sync_disabled')) return 'sync_disabled';
        return 'not_configured';
    };

    const daySyncStatus = getDaySyncStatus();
    const daySyncEnabled = entries.some(e => e.drive_sync_enabled);

    const syncStatusLabel = {
        synced: 'Synced',
        pending: 'Syncing…',
        sync_failed: 'Sync failed',
        sync_disabled: 'Sync disabled',
        not_configured: 'Not configured',
    }[daySyncStatus];

    const syncStatusClasses = {
        synced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        pending: 'bg-blue-50 text-blue-700 border-blue-200',
        sync_failed: 'bg-red-50 text-red-700 border-red-200',
        sync_disabled: 'bg-slate-50 text-slate-600 border-slate-200',
        not_configured: 'bg-slate-50 text-slate-500 border-slate-200',
    }[daySyncStatus];

    // Ref to store polling interval
    const pollIntervalRef = useRef(null);
    
    // Poll for sync status updates when status is pending
    useEffect(() => {
        // If sync is enabled and status is pending, start polling
        if (daySyncEnabled && daySyncStatus === 'pending') {
            pollIntervalRef.current = setInterval(() => {
                onRefresh();
            }, 1500); // Poll every 1.5 seconds
        } else {
            // Stop polling if sync is disabled or status is not pending
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        }
        
        // Cleanup on unmount
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, [daySyncEnabled, daySyncStatus, onRefresh]);
    
    const handleToggleSync = async (e) => {
        e.stopPropagation();
        if (!userId || !token) return;
        try {
            await axios.patch(
                `${API_BASE}/users/${userId}/days/${date}/sync-settings`,
                { drive_sync_enabled: !daySyncEnabled },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            // Refresh entries from backend immediately
            onRefresh();
        } catch (error) {
            console.error('Error updating drive sync setting:', error);
            alert('Failed to update Drive sync setting for this day.');
        }
    };

    return (
        <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-white">
            {/* Date Header - Clickable to Expand/Collapse */}
            <div 
                className="bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-3 cursor-pointer hover:from-slate-600 hover:to-slate-700 transition-all duration-200"
                onClick={onToggle}
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg text-white font-semibold">{isExpanded ? '▼' : '▶'}</span>
                        <div>
                            <h3 className="font-semibold text-white">{formatDateHeader(date)}</h3>
                            <p className="text-xs text-slate-300 mt-0.5">
                                {date} • {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Sync toggle + status */}
                        <button
                            onClick={handleToggleSync}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-white/10 text-slate-100 hover:bg-white/20 transition-colors`}
                        >
                            <span
                                className={`inline-flex h-2 w-2 rounded-full ${
                                    daySyncEnabled ? 'bg-emerald-400' : 'bg-slate-300'
                                }`}
                            ></span>
                            <span>{daySyncEnabled ? 'Drive sync: ON' : 'Drive sync: OFF'}</span>
                        </button>
                        <div
                            className={`hidden md:block text-xs font-medium px-2.5 py-1 rounded-full border ${syncStatusClasses}`}
                        >
                            {syncStatusLabel}
                        </div>
                        <div className="hidden lg:block text-sm text-slate-200 max-w-xs truncate font-medium bg-slate-800/50 px-3 py-1 rounded-md">
                            {summarySnippet}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 bg-slate-50">
                    {/* Merged Transcript for the Day */}
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-slate-800">Merged Day Transcript</h4>
                            <span className="text-xs text-slate-600 bg-white px-2 py-1 rounded-md border border-slate-200">{entries.length} entries merged</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {mergedTranscript || 'No transcripts available for this day'}
                        </p>
                    </div>

                    {/* Individual Entries */}
                    <div className="space-y-3">
                        <h4 className="font-semibold text-gray-900 mb-2">Individual Recordings:</h4>
                        {entries.map((entry) => (
                            <Entry 
                                key={entry.id} 
                                entry={entry} 
                                entries={entries} 
                                onEntriesChange={onEntriesChange}
                                onRefresh={onRefresh}
                                editingEntryId={editingEntryId}
                                setEditingEntryId={setEditingEntryId}
                                editJournalDate={editJournalDate}
                                setEditJournalDate={setEditJournalDate}
                                onUpdateDate={onUpdateDate}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Entry Component
const Entry = ({ 
    entry, 
    entries, 
    onEntriesChange,
    onRefresh,
    editingEntryId,
    setEditingEntryId,
    editJournalDate,
    setEditJournalDate,
    onUpdateDate
}) => {
    const {entryId, setEntryId} = useEntryId();
    const { token } = useAuth();
    const { userId } = useContext(UserIdContext);
    const {selectedentryId, setSelectedentryId} = useSelectedentryId();
    const [audioURL, setAudioURL] = useState(null);

    // Load audio file if local_path exists
    useEffect(() => {
        if (entry.local_path) {
            // Construct audio URL from backend
            const audioPath = entry.local_path.startsWith('audio_files/') 
                ? entry.local_path 
                : `audio_files/${entry.local_path}`;
            setAudioURL(`${API_BASE}/audio/${audioPath}`);
        }
    }, [entry.local_path]);

    const deleteEntry = async() => {
        if (!userId || !token || !entry.id) return;
        try {
            await axios.delete(
                API_BASE + '/users/'+ userId + '/entries/' + entry.id,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            onRefresh();
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const handleDeleteEntry = (e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this entry?')) {
            deleteEntry();
        }
    };

    const handleDivClick = (e) => {
        e.preventDefault();
        setEntryId(entry.id);
        setSelectedentryId(entry.id);
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (ms) => {
        if (!ms) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const isSelected = entry.id === selectedentryId;
    const isEditing = editingEntryId === entry.id;

    return (
        <div 
            className={`border rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                isSelected 
                    ? 'border-blue-500 shadow-md bg-blue-50' 
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-sm'
            }`}
            onClick={handleDivClick}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Entry #{entry.id}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-600 font-medium">{formatTime(entry.created_at)}</span>
                        {entry.duration_ms && (
                            <>
                                <span className="text-xs text-slate-400">•</span>
                                <span className="text-xs text-slate-600 font-medium">{formatDuration(entry.duration_ms)}</span>
                            </>
                        )}
                    </div>
                    
                    {/* Journal Date - Editable */}
                    {isEditing ? (
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="date"
                                value={editJournalDate}
                                onChange={(e) => setEditJournalDate(e.target.value)}
                                className="text-xs px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                max={new Date().toISOString().split('T')[0]}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateDate(entry.id, editJournalDate);
                                }}
                                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                                Save
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingEntryId(null);
                                }}
                                className="text-xs px-2 py-1 bg-slate-500 text-white rounded hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-slate-600 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Date: {entry.journal_date || entry.created_at.split('T')[0]}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingEntryId(entry.id);
                                    setEditJournalDate(entry.journal_date || entry.created_at.split('T')[0]);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                title="Edit date"
                            >
                                Edit
                            </button>
                        </div>
                    )}

                    <p className="text-sm text-gray-800 line-clamp-3 leading-snug font-medium">
                        {entry.transcript || 'No transcript available'}
                    </p>
                </div>
            </div>

            {/* Audio Playback */}
            {entry.local_path && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs font-semibold text-slate-700 mb-2">Audio Recording:</p>
                    {audioURL ? (
                        <audio 
                            controls 
                            className="w-full h-8"
                            src={audioURL}
                        >
                            Your browser does not support audio playback.
                        </audio>
                    ) : (
                        <p className="text-xs text-gray-400 italic">
                            Loading audio...
                        </p>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 mt-3">
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditingEntryId(entry.id);
                        setEditJournalDate(entry.journal_date || entry.created_at.split('T')[0]);
                    }}
                    className="text-xs px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded font-medium transition-colors"
                    title="Edit date"
                >
                    Edit Date
                </button>
                <button 
                    onClick={handleDeleteEntry}
                    className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
                    title="Delete"
                >
                    Delete
                </button>
            </div>
        </div>
    );
};

export default EntryList;
