import { useState, useEffect } from "react";
import MicRecorder from "mic-recorder-to-mp3";
import axios from "axios";
import { useScript } from "./ScriptContext";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE } from "../config/api";

//bitRate option is set to 128, which means the audio recorder will use a bit rate of 128 kbps (kilobits per second) when encoding the recorded audio into an MP3 file.
//Bit rate refers to the number of bits (binary digits) that are processed or transmitted per unit of time. In the context of audio recording, the bit rate determines the quality and size of the recorded audio file.

// Initialize recorder
const recorder = new MicRecorder({ 
  bitRate: 128,
  encoder: 'mp3',
});

const AudioRecording = ({ onRecordingComplete, showTimer = false, entryId = null, onRetryTranscription = null }) => {
  const { script,setScript } = useScript();
  const { token } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [blobURL, setBlobURL] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [duration, setDuration] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const [savedAudioPath, setSavedAudioPath] = useState(null);
  

  useEffect(() => {
    const checkPermission = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Request audio with echo cancellation and noise suppression
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100,
            } 
          });
          console.log("Permission Granted");
          setMediaStream(stream);
          setIsBlocked(false);
          // Stop the stream immediately - we'll create a new one when recording
          stream.getTracks().forEach(track => track.stop());
        } else {
          const getUserMedia =
            navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia ||
            navigator.msGetUserMedia;

          if (getUserMedia) {
            getUserMedia(
              { 
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                } 
              },
              (stream) => {
                console.log("Permission Granted");
                setMediaStream(stream);
                setIsBlocked(false);
                stream.getTracks().forEach(track => track.stop());
              },
              () => {
                console.log("Permission Denied");
                setIsBlocked(true);
              }
            );
          } else {
            console.log("getUserMedia is not supported in this browser.");
          }
        }
      } catch (error) {
        console.error("Error checking permission:", error);
        setIsBlocked(true);
      }
    };

    checkPermission();

    // Check for emergency recording on mount
    const checkEmergencyRecording = () => {
      const emergencyData = localStorage.getItem('emergency_recording');
      if (emergencyData) {
        try {
          const data = JSON.parse(emergencyData);
          const timestamp = new Date(data.timestamp);
          const timeAgo = Date.now() - data.timestamp;
          
          // Only show if it's from the last session (within 1 hour)
          if (timeAgo < 3600000) {
            const shouldRestore = window.confirm(
              `An emergency recording was saved ${Math.round(timeAgo / 1000 / 60)} minutes ago when you left the page. Would you like to restore it?`
            );
            
            if (shouldRestore) {
              // Convert base64 back to blob
              fetch(data.audio)
                .then(res => res.blob())
                .then(blob => {
                  const file = new File([blob], "emergency_recording.mp3", { type: "audio/mpeg" });
                  setAudioFile(file);
                  setBlobURL(URL.createObjectURL(blob));
                  setDuration(data.duration);
                  console.log('Emergency recording restored');
                });
            }
            
            // Clear emergency recording
            localStorage.removeItem('emergency_recording');
          } else {
            // Old emergency recording, remove it
            localStorage.removeItem('emergency_recording');
          }
        } catch (err) {
          console.error('Error parsing emergency recording:', err);
          localStorage.removeItem('emergency_recording');
        }
      }
    };

    checkEmergencyRecording();

    // Cleanup on unmount
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle recording interruption (page navigation, tab switch, screen lock, etc.)
  useEffect(() => {
    if (!isRecording) return;

    const handleBeforeUnload = (e) => {
      // If recording is in progress, try to save it
      if (isRecording && recorder) {
        e.preventDefault();
        e.returnValue = 'You are currently recording. Are you sure you want to leave?';
        
        // Try to stop and save recording
        try {
          recorder.stop().getMp3().then(async ([buffer, blob]) => {
            const recordingDuration = recordingStartTime ? Date.now() - recordingStartTime : 0;
            const file = new File(buffer, "audio_emergency_save.mp3", {
              type: blob.type,
              lastModified: Date.now(),
            });
            
            // Store in localStorage as emergency backup
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result;
              localStorage.setItem('emergency_recording', JSON.stringify({
                audio: base64data,
                duration: recordingDuration,
                timestamp: Date.now(),
              }));
            };
            reader.readAsDataURL(blob);
          }).catch(err => {
            console.error('Error saving emergency recording:', err);
          });
        } catch (err) {
          console.error('Error in emergency save:', err);
        }
      }
      return e.returnValue;
    };

    const handleVisibilityChange = () => {
      // If page becomes hidden (tab switch, minimize, screen lock) and recording is active
      if (document.hidden && isRecording) {
        console.log('Page hidden during recording - attempting to save...');
        
        // Try to stop and save the recording
        try {
          if (recorder && mediaStream) {
            recorder.stop().getMp3().then(async ([buffer, blob]) => {
              const recordingDuration = recordingStartTime ? Date.now() - recordingStartTime : 0;
              const file = new File(buffer, "audio_emergency_save.mp3", {
                type: blob.type,
                lastModified: Date.now(),
              });
              
              // Store in localStorage as emergency backup
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result;
                localStorage.setItem('emergency_recording', JSON.stringify({
                  audio: base64data,
                  duration: recordingDuration,
                  timestamp: Date.now(),
                }));
                console.log('Emergency recording saved to localStorage');
              };
              reader.readAsDataURL(blob);
              
              // Stop recording state
              setIsRecording(false);
              if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                setMediaStream(null);
              }
              
              // Clear timer
              if (window.recordingTimerInterval) {
                clearInterval(window.recordingTimerInterval);
                window.recordingTimerInterval = null;
              }
            }).catch(err => {
              console.error('Error saving emergency recording:', err);
            });
          }
        } catch (err) {
          console.error('Error in visibility change handler:', err);
        }
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording, recordingStartTime, mediaStream]);

  const start = async () => {
    if (isBlocked) {
      console.log("Permission Denied");
      return;
    }

    try {
      // Clear any previous audio playback to prevent echo
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
        setBlobURL("");
      }

      // Get a fresh MediaStream with echo cancellation for recording
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          // Additional constraint to prevent feedback
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
        } 
      });

      // Start recorder - MicRecorder will use the active stream
      await recorder.start();
      
      const startTime = Date.now();
      setRecordingStartTime(startTime);
      setElapsedTime(0);
      setIsRecording(true);
      setMediaStream(stream);
      
      // Start timer interval if showTimer is true
      if (showTimer) {
        // Clear any existing interval
        if (window.recordingTimerInterval) {
          clearInterval(window.recordingTimerInterval);
        }
        
        const timerInterval = setInterval(() => {
          const currentTime = Date.now();
          setElapsedTime(currentTime - startTime);
        }, 100);
        
        // Store interval ID to clear it later
        window.recordingTimerInterval = timerInterval;
      }
    } catch (e) {
      console.error("Error starting recording:", e);
      alert("Failed to start recording. Please check microphone permissions.");
    }
  };

  const stop = () => {
    // Clear timer interval
    if (window.recordingTimerInterval) {
      clearInterval(window.recordingTimerInterval);
      window.recordingTimerInterval = null;
    }
    
    // Stop the media stream tracks to release the microphone
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }

    recorder
      .stop()
      .getMp3()
      .then(async ([buffer, blob]) => {
        // Calculate duration
        const recordingDuration = recordingStartTime ? Date.now() - recordingStartTime : 0;
        setDuration(recordingDuration);
        setRecordingStartTime(null);

        const blobURL = URL.createObjectURL(blob);
        setBlobURL(blobURL);

        const file = new File(buffer, "audio.mp3", {
          type: blob.type,
          lastModified: Date.now(),
        });

        setAudioFile(file); // Store the file for later use

        // Use the file directly for upload (no need to convert back and forth)
        const audioFileForUpload = file;

        // Create FormData to send to backend
        const formData = new FormData();
        formData.append("audio", audioFileForUpload);

        // Show transcribing loader
        setIsTranscribing(true);
        setTranscriptionError(null);

        // Send to backend proxy endpoint (which will call OpenAI)
        axios({
          method: "post",
          url: `${API_BASE}/transcribe`,
          data: formData,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })
          .then(async (response) => {
            const transcript = response.data.data.transcript;
            const local_path = response.data.data.local_path;
            const language = response.data.data.language;
            const confidence = response.data.data.confidence;
            
            console.log("Transcript:", transcript);
            console.log("Audio saved at:", local_path);
           
            setScript(transcript);
            setSavedAudioPath(local_path);
            
            // Save transcript to transcripts table if entryId is provided
            if (entryId && token) {
              try {
                await axios.post(
                  `${API_BASE}/transcripts`,
                  {
                    recording_id: entryId,
                    text: transcript,
                    language: language,
                    confidence: confidence,
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
                console.log("Transcript saved to database");
              } catch (transcriptError) {
                console.error("Error saving transcript to database:", transcriptError);
                // Don't fail the whole process if transcript saving fails
              }
            }
            
            // Notify parent component about recording completion
            if (onRecordingComplete) {
              onRecordingComplete({
                transcript,
                duration_ms: recordingDuration,
                local_path,
                audioFile: file,
              });
            }
            
            setIsTranscribing(false);
          })
          .catch((error) => {
            console.error("Transcription error:", error);
            setIsTranscribing(false);
            setTranscriptionError({
              message: error.response?.data?.message || "Transcription failed. Please check your OpenAI API key in backend/config.env",
              audio_saved: error.response?.data?.audio_saved || false,
            });
          });

        setIsRecording(false);
      })
      .catch((e) => console.error(e));
  };

  const audioToBase64 = async (audioFile) => {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(audioFile);
    });
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRetryTranscription = async () => {
    if (!savedAudioPath && !audioFile) {
      alert("No audio file available to retry transcription");
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError(null);

    try {
      const formData = new FormData();
      
      // If we have the audio file, use it; otherwise, we'd need to fetch from savedAudioPath
      if (audioFile) {
        formData.append("audio", audioFile);
      } else {
        // Fetch audio from saved path and create a file
        const response = await fetch(`${API_BASE}/audio/${savedAudioPath}`);
        const blob = await response.blob();
        const file = new File([blob], "audio.mp3", { type: "audio/mpeg" });
        formData.append("audio", file);
      }

      const response = await axios({
        method: "post",
        url: `${API_BASE}/transcribe`,
        data: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const transcript = response.data.data.transcript;
      const local_path = response.data.data.local_path;
      const language = response.data.data.language;
      const confidence = response.data.data.confidence;

      setScript(transcript);
      setSavedAudioPath(local_path);

      // Save transcript to transcripts table if entryId is provided
      if (entryId && token) {
        try {
          await axios.post(
            `${API_BASE}/transcripts`,
            {
              recording_id: entryId,
              text: transcript,
              language: language,
              confidence: confidence,
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
        } catch (transcriptError) {
          console.error("Error saving transcript to database:", transcriptError);
        }
      }

      if (onRecordingComplete) {
        onRecordingComplete({
          transcript,
          duration_ms: duration,
          local_path,
          audioFile: audioFile,
        });
      }

      setIsTranscribing(false);
    } catch (error) {
      console.error("Retry transcription error:", error);
      setIsTranscribing(false);
      setTranscriptionError({
        message: error.response?.data?.message || "Transcription failed. Please try again.",
        audio_saved: error.response?.data?.audio_saved || false,
      });
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className="flex items-center gap-3">
        <button 
          onClick={start} 
          disabled={isRecording || isTranscribing} 
          className='w-14 h-14 flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 text-white rounded-full hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-2xl'
        >
          🎤
        </button>
        <button 
          onClick={stop} 
          disabled={!isRecording || isTranscribing} 
          className='w-14 h-14 flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white rounded-full hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xl'
        >
          ⏹
        </button>
        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            <span className="text-sm text-gray-700 font-medium">Recording...</span>
            {showTimer && (
              <span className="text-lg font-bold text-red-600 font-mono">
                {formatTime(elapsedTime)}
              </span>
            )}
          </div>
        )}
        {isTranscribing && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-blue-700 font-medium">Transcribing...</span>
          </div>
        )}
      </div>
      
      {/* Transcription Error with Retry */}
      {transcriptionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800 mb-2">{transcriptionError.message}</p>
          {transcriptionError.audio_saved && (
            <p className="text-xs text-red-600 mb-2">✓ Audio file saved. You can retry transcription.</p>
          )}
          <button
            onClick={handleRetryTranscription}
            disabled={isTranscribing}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isTranscribing ? "Retrying..." : "Retry Transcription"}
          </button>
        </div>
      )}
      
      {blobURL && (
        <div className="flex flex-col gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <audio 
              src={blobURL} 
              controls 
              muted 
              volume={0.3}
              className="w-full"
              onPlay={(e) => {
                e.target.volume = 0.3;
                e.target.muted = false;
              }}
            />
          </div>
          <p className="text-xs text-gray-500">
            💡 Tip: Use headphones for best results
          </p>
        </div>
      )}
    </div>
    
    
  );
};



const Audio = ({ onRecordingComplete, showTimer = false, entryId = null, onRetryTranscription = null }) => {
  return (
    <div>
      <AudioRecording 
        onRecordingComplete={onRecordingComplete} 
        showTimer={showTimer}
        entryId={entryId}
        onRetryTranscription={onRetryTranscription}
      />
    </div>
  );
};

export default Audio;