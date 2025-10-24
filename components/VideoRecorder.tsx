import React, { useState, useRef, useCallback } from 'react';

type RecordingStatus = 'idle' | 'permission-pending' | 'ready' | 'recording' | 'finished';

// Icons for UI elements
const CameraIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55a1 1 0 011.45.89V18a1 1 0 01-1.45.89L15 16M4 6h10a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
);

const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const VideoRecorder: React.FC = () => {
    const [status, setStatus] = useState<RecordingStatus>('idle');
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [duration, setDuration] = useState<number>(1); // Default duration 1 minute
    const [elapsedTime, setElapsedTime] = useState(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const stopwatchRef = useRef<number | null>(null);

    const handleRequestPermission = useCallback(async () => {
        setStatus('permission-pending');
        setError(null);

        const videoConstraints = { facingMode: 'environment' };

        try {
            let stream: MediaStream;
            try {
                 stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
            } catch (e) {
                console.warn("Could not get environment camera, trying default.", e);
                // If environment camera fails, fall back to any camera
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            }

            setMediaStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStatus('ready');
        } catch (err) {
            console.error("Error accessing media devices.", err);
            setError("Could not access camera and microphone. Please check permissions in your browser settings.");
            setStatus('idle');
        }
    }, []);

    const startStopwatch = () => {
        setElapsedTime(0);
        stopwatchRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);
    };

    const stopStopwatch = () => {
        if (stopwatchRef.current) {
            clearInterval(stopwatchRef.current);
            stopwatchRef.current = null;
        }
    };

    // FIX: Moved `handleStopRecording` before `handleStartRecording` as it is a dependency.
    const handleStopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
    }, []);

    const handleStartRecording = useCallback(() => {
        if (!mediaStream) return;
        
        setStatus('recording');
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(mediaStream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            setRecordedVideoUrl(url);
            setStatus('finished');
            stopStopwatch();
            mediaStream.getTracks().forEach(track => track.stop());
            setMediaStream(null);
        };

        recorder.start();
        startStopwatch();

        if (duration > 0) {
            timerRef.current = window.setTimeout(() => {
                handleStopRecording();
            }, duration * 60 * 1000);
        }

    }, [mediaStream, duration, handleStopRecording]);
    
    const handleDownload = () => {
        if (!recordedVideoUrl) return;
        const a = document.createElement('a');
        a.href = recordedVideoUrl;
        a.download = `recording-${new Date().toISOString()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleNewRecording = () => {
        if (recordedVideoUrl) {
            URL.revokeObjectURL(recordedVideoUrl);
        }
        setRecordedVideoUrl(null);
        setStatus('idle');
        setError(null);
        setElapsedTime(0);
    };
    
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    return (
        <div className="w-full max-w-4xl p-6 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg shadow-lg flex flex-col items-center">
            {status === 'idle' && (
                 <button onClick={handleRequestPermission} className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-all">
                    <CameraIcon />
                    Start Camera
                </button>
            )}

            {status === 'permission-pending' && <div className="flex items-center text-lg"><Spinner /> Requesting permissions...</div>}
            
            {error && <p className="text-red-400 mt-4">{error}</p>}
            
            {(status === 'ready' || status === 'recording') && (
                <div className="w-full flex flex-col items-center">
                    <div className="w-full aspect-video rounded-lg overflow-hidden border-2 border-slate-700 bg-black mb-4 relative">
                        <video ref={videoRef} autoPlay muted className="w-full h-full object-cover"></video>
                        {status === 'recording' && (
                             <div className="absolute top-2 left-2 flex items-center bg-black/50 p-2 rounded-lg" aria-live="polite">
                                <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse mr-2"></span>
                                <span className="text-white font-mono">{formatTime(elapsedTime)}</span>
                            </div>
                        )}
                    </div>

                    <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4">
                        {status === 'ready' && (
                             <div className="flex items-center gap-2">
                                <label htmlFor="duration" className="text-slate-300">Duration (min):</label>
                                <input 
                                    id="duration"
                                    type="number" 
                                    value={duration}
                                    onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value, 10)))}
                                    min="1"
                                    className="w-20 bg-slate-900 border border-slate-600 rounded-md p-2 text-center"
                                />
                            </div>
                        )}
                       
                        {status === 'ready' && (
                            <button onClick={handleStartRecording} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-md font-semibold transition-colors">Start Recording</button>
                        )}
                        {status === 'recording' && (
                            <button onClick={handleStopRecording} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-md font-semibold transition-colors">Stop Recording</button>
                        )}
                    </div>
                </div>
            )}
            
            {status === 'finished' && recordedVideoUrl && (
                 <div className="w-full flex flex-col items-center">
                     <h2 className="text-xl font-semibold mb-2 text-slate-200">Recording Complete</h2>
                     <video src={recordedVideoUrl} controls className="w-full aspect-video rounded-lg border-2 border-slate-700 mb-4"></video>
                     <div className="flex gap-4">
                        <button onClick={handleDownload} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md font-semibold transition-colors">Download</button>
                        <button onClick={handleNewRecording} className="px-5 py-2 bg-slate-600 hover:bg-slate-700 rounded-md font-semibold transition-colors">Record Another</button>
                     </div>
                 </div>
            )}
        </div>
    );
};