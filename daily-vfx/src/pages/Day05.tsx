import React, { useRef, useEffect, useState, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as Tone from "tone";

// --- Audio Parameters ---
const F_MIN = 65.41; // C2
const F_MAX = 2093.00; // C7
const CURVE_K = 1.0; 

// --- Parameters for Quantized Mode (12-TET) ---
const NOTE_MIN = 48; // C3
const NOTE_MAX = 96; // C7

/**
 * Helper to convert MIDI note number to frequency.
 */
function midiToFreq(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/**
 * A robust, self-contained function to convert a MIDI number to a note name (e.g., 69 -> "A4").
 */
function midiToNoteName(midiNumber: number): string {
    if (midiNumber < 0 || midiNumber > 127) {
        return "";
    }
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    return noteNames[noteIndex] + octave;
}


/**
 * Quantized Pitch: Converts distance to the nearest semitone frequency.
 */
function distanceToFreq12TET(d: number, noteMin = NOTE_MIN, noteMax = NOTE_MAX, k = CURVE_K): number {
  const clamped = Math.min(Math.max(d, 0), 1);
  const x = Math.pow(1 - clamped, k);
  const nStar = noteMin + x * (noteMax - noteMin);
  const n = Math.round(nStar); // Quantize to the nearest semitone
  return midiToFreq(n);
}

/**
 * Continuous Pitch: Converts distance to a continuous frequency via exponential mapping.
 */
function distanceToFreqContinuous(d: number, fMin = F_MIN, fMax = F_MAX, k = CURVE_K): number {
  const clamped = Math.min(Math.max(d, 0), 1);
  const x = Math.pow(1 - clamped, k);
  return fMin * Math.pow(fMax / fMin, x);
}


const Day05 = () => {
  console.log("--- 1. Component Render ---");
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const requestRef = useRef(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const oscillatorRef = useRef<Tone.Oscillator | null>(null);
  const gainRef = useRef<Tone.Gain | null>(null);

  const [appState, setAppState] = useState<"loading" | "ready" | "running" | "error">("loading");
  const [detectedHands, setDetectedHands] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const [audioParams, setAudioParams] = useState({ freq: 0, vol: -60 });
  const [isQuantized, setIsQuantized] = useState(false); // State for pitch mode toggle
  const [waveform, setWaveform] = useState<Tone.ToneOscillatorType>('sine'); // State for waveform
  const [currentNote, setCurrentNote] = useState(""); // State for the current note name
  const [areHandsSwapped, setAreHandsSwapped] = useState(false); // State for swapping hand controls

  // Effect for one-time setup and teardown
  useEffect(() => {
    console.log(`--- 2. Main useEffect runs (once) ---`);
    const host = hostRef.current!;

    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.style.display = 'none';
    videoRef.current = video;
    host.appendChild(video);
    console.log(" -> DOM elements (canvas, video) created");

    const createHandLandmarker = async () => {
      console.log(" -> 2a. Initializing MediaPipe HandLandmarker...");
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/hand_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        handLandmarkerRef.current = landmarker;
        setAppState("ready");
        console.log(" -> 2b. MediaPipe initialized successfully! State changed to 'ready'");
      } catch (e) {
        console.error("Model loading failed:", e);
        setAppState("error");
      }
    };

    createHandLandmarker();

    // Cleanup function on component unmount
    return () => {
      console.log("--- 6. Main useEffect cleanup (once) ---");
      cancelAnimationFrame(requestRef.current);
      console.log(" -> requestAnimationFrame cancelled");

      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        console.log(" -> Camera stream stopped");
      }

      oscillatorRef.current?.stop().dispose();
      gainRef.current?.dispose();
      
      if (Tone.context.state !== 'closed') {
        Tone.context.dispose();
        console.log(" -> Tone.js context disposed");
      }
      
      host.innerHTML = '';
      console.log("--- Cleanup complete ---");
    };
  }, []); // Empty dependency array ensures this effect runs only once

  const processLandmarks = useCallback((landmarks: any[], handednesses: any[], ctx: CanvasRenderingContext2D) => {
    let detectedRightHand: { x: number; y: number } | null = null;
    let detectedLeftHand: { x: number; y: number } | null = null;
    let newNote = "";

    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];
        const handedness = handednesses[i]?.[0]?.categoryName;
        const indexFingerTip = landmark[8];

        if (!indexFingerTip) continue;

        if (handedness === 'Right') {
            detectedRightHand = { x: indexFingerTip.x, y: indexFingerTip.y };
        } else if (handedness === 'Left') {
            detectedLeftHand = { x: indexFingerTip.x, y: indexFingerTip.y };
        }
    }
    
    // Assign roles based on swap state
    const pitchHandPos = areHandsSwapped ? detectedLeftHand : detectedRightHand;
    const volumeHandPos = areHandsSwapped ? detectedRightHand : detectedLeftHand;

    setDetectedHands({ left: !!detectedLeftHand, right: !!detectedRightHand });

    if (canvasRef.current) {
        if (detectedRightHand) drawDot(ctx, detectedRightHand, 'rgba(255, 0, 0, 0.7)'); // Physical Right is always Red
        if (detectedLeftHand) drawDot(ctx, detectedLeftHand, 'rgba(0, 0, 255, 0.7)'); // Physical Left is always Blue
    }

    if (pitchHandPos && volumeHandPos && oscillatorRef.current && gainRef.current) {
        let freq: number;
        if (isQuantized) {
          const clamped = Math.min(Math.max(pitchHandPos.x, 0), 1);
          const x = Math.pow(1 - clamped, CURVE_K);
          const nStar = NOTE_MIN + x * (NOTE_MAX - NOTE_MIN);
          const n = Math.round(nStar);
          freq = midiToFreq(n);
          newNote = midiToNoteName(n);
        } else {
          freq = distanceToFreqContinuous(pitchHandPos.x);
        }
        
        oscillatorRef.current.frequency.exponentialRampTo(freq, 0.02);

        const minVolDB = -60;
        const maxVolDB = 0;
        const vol = minVolDB + (1 - volumeHandPos.y) * (maxVolDB - minVolDB);
        
        const volumeRampTime = waveform === 'sine' ? 0.1 : 0.05;
        gainRef.current.gain.rampTo(Tone.dbToGain(vol), volumeRampTime);
        
        setAudioParams({ freq, vol });

    } else {
      if (gainRef.current) {
        gainRef.current.gain.rampTo(0, 0.1);
      }
      setAudioParams(prev => ({ ...prev, vol: -60 }));
    }
    
    setCurrentNote(newNote);
  }, [isQuantized, waveform, areHandsSwapped]);


  // Effect to control the prediction loop based on appState
  useEffect(() => {
    const predictWebcam = () => {
      const video = videoRef.current;
      const landmarker = handLandmarkerRef.current;
      const canvas = canvasRef.current;

      if (!video || !landmarker || !canvas || video.readyState < 2) {
        requestRef.current = requestAnimationFrame(predictWebcam);
        return;
      }
      
      const ctx = canvas.getContext("2d")!;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const results = landmarker.detectForVideo(video, performance.now());
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        processLandmarks(results.landmarks, results.handednesses, ctx);
      }

      if (appState === "running") {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
    };
    
    if (appState === "running") {
      requestRef.current = requestAnimationFrame(predictWebcam);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => {
      cancelAnimationFrame(requestRef.current);
    }

  }, [appState, processLandmarks]);

  // Effect to update oscillator type when waveform state changes
  useEffect(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.type = waveform;
    }
  }, [waveform]);
    
  const drawDot = (ctx: CanvasRenderingContext2D, pos: { x: number; y: number }, color: string) => {
    if (!canvasRef.current) return;
    const drawX = (1 - pos.x) * canvasRef.current.width;
    const drawY = pos.y * canvasRef.current.height;
    ctx.beginPath();
    ctx.arc(drawX, drawY, 15, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  };

  const handleStart = async () => {
    if (appState !== "ready") return;
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }
      
      gainRef.current = new Tone.Gain(0).toDestination();
      oscillatorRef.current = new Tone.Oscillator({
        type: waveform,
        frequency: 440,
      }).connect(gainRef.current).start();

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', () => {
           const video = videoRef.current;
           if (video && hostRef.current) {
             const aspectRatio = video.videoWidth / video.videoHeight;
             hostRef.current.style.aspectRatio = String(aspectRatio);
           }
           setAppState("running");
        });
      }
    } catch (err) {
      console.error("Start failed:", err);
      setAppState("error");
    }
  };

  const renderStatus = () => {
    const pitchHandLabel = areHandsSwapped ? 'L' : 'R';
    const volumeHandLabel = areHandsSwapped ? 'R' : 'L';

    switch (appState) {
      case 'loading':
        return <p className="text-lg">Loading hand detection model...</p>;
      case 'ready':
        return <button onClick={handleStart} className="px-6 py-3 bg-slate-500 text-white font-bold rounded-lg shadow-lg hover:bg-slate-600 transition-colors">Start Theremin</button>;
      case 'running':
        return <div className="text-center font-mono bg-slate-800 text-white p-2 rounded-md">
            <p>Pitch ({pitchHandLabel}): {audioParams.freq.toFixed(2)} Hz</p>
            <p>Volume ({volumeHandLabel}): {audioParams.vol.toFixed(2)} dB</p>
            <div className="flex justify-center items-center space-x-4 mt-2">
                <span>Left Hand: {detectedHands.left ? '✅' : '❌'}</span>
                <span>Right Hand: {detectedHands.right ? '✅' : '❌'}</span>
            </div>
        </div>;
      case 'error':
        return <p className="text-lg text-red-500">An error occurred. Please grant camera permission and refresh the page.</p>;
      default:
        return null;
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-4 p-4">
      <h1 className="text-3xl font-bold text-gray-800">Web Theremin</h1>
      <p className="text-gray-600 text-center">Use your hands to control the sound. Right hand for pitch, left hand for volume.</p>
      <div className="w-full relative">
        <div ref={hostRef} className="w-full bg-gray-900 rounded-lg overflow-hidden shadow-2xl border-4 border-gray-300" />
        {appState === 'running' && (
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <button
                    onClick={() => setIsQuantized(prev => !prev)}
                    className={`px-4 py-2 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 ${isQuantized ? 'bg-teal-700 bg-opacity-80' : 'bg-slate-500 bg-opacity-70'}`}
                >
                    {isQuantized ? 'Quantized Mode' : 'Continuous Mode'}
                </button>
            </div>
        )}
        {appState === 'running' && isQuantized && currentNote && (
            <div className="absolute top-4 left-4 z-10 p-2 text-white font-mono text-2xl bg-black bg-opacity-50 rounded-lg">
                {currentNote}
            </div>
        )}
      </div>
      <div className="h-24 flex flex-col items-center justify-center gap-4">
        {renderStatus()}
        {appState === 'running' && (
            <div className="flex items-center justify-center gap-4">
                <div className="flex justify-center items-center gap-2 p-1 bg-slate-200 rounded-lg shadow-inner">
                    <button
                        onClick={() => setWaveform('sine')}
                        className={`px-4 py-1 text-sm font-semibold rounded-md transition-all duration-200 ${waveform === 'sine' ? 'bg-slate-600 text-white shadow' : 'bg-white text-gray-800 hover:bg-slate-100'}`}
                    >
                        Sine
                    </button>
                    <button
                        onClick={() => setWaveform('triangle')}
                        className={`px-4 py-1 text-sm font-semibold rounded-md transition-all duration-200 ${waveform === 'triangle' ? 'bg-slate-600 text-white shadow' : 'bg-white text-gray-800 hover:bg-slate-100'}`}
                    >
                        Triangle
                    </button>
                </div>
                <button
                    onClick={() => setAreHandsSwapped(prev => !prev)}
                    className="p-2 bg-slate-200 rounded-lg shadow-inner hover:bg-slate-300 transition-colors"
                    title="Swap Hands"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default Day05;

