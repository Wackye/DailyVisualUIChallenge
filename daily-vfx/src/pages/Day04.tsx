// src/days/Day04.tsx
import React, { useRef, useEffect, useState } from "react";
import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

// --- Emoji Particle Class (unchanged) ---
class EmojiParticle {
  character: string; x: number; y: number; vx: number; vy: number; gravity: number; lifespan: number; opacity: number; size: number; createdAt: number;
  constructor(character: string, x: number, y: number) { this.character = character; this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 8; this.vy = (Math.random() - 0.5) * 15 - 5; this.gravity = 0.3; this.lifespan = 60 + Math.random() * 60; this.opacity = 1; this.size = 20 + Math.random() * 20; this.createdAt = 0; }
  update() { this.vy += this.gravity; this.x += this.vx; this.y += this.vy; this.createdAt++; if (this.createdAt > this.lifespan * 0.7) { this.opacity -= 0.05; } }
  draw(ctx: CanvasRenderingContext2D) { ctx.save(); ctx.globalAlpha = this.opacity < 0 ? 0 : this.opacity; ctx.font = `${this.size}px Arial`; ctx.fillText(this.character, this.x, this.y); ctx.restore(); }
  isAlive() { return this.createdAt < this.lifespan && this.opacity > 0; }
}

type AppState = "LOADING_MODEL" | "READY" | "RUNNING" | "PERMISSION_DENIED" | "ERROR";

// --- 為了在迴圈中只 log 幾次，避免洗版 ---
let predictWebcamFrameCounter = 0;

const Day04 = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const animationFrameId = useRef<number>();
  const fireworks = useRef<EmojiParticle[]>([]);
  const gestureRecognizer = useRef<GestureRecognizer | null>(null);
  
  const [appState, setAppState] = useState<AppState>("LOADING_MODEL");
  const [errorMessage, setErrorMessage] = useState("");

  const [showSkeleton, setShowSkeleton] = useState(true);
  const showSkeletonRef = useRef(showSkeleton);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);
  
  const gestureEmojiMap: { [key: string]: string } = { "Thumb_Up": "👍", "Victory": "✌️", "Pointing_Up": "👆", "Open_Palm": "🖐️", "Closed_Fist": "✊", "ILoveYou": "🤟" };

  useEffect(() => {
    const createGestureRecognizer = async () => {
      // DEBUG: 追蹤模型初始化流程
      console.groupCollapsed("1. 階段：模型初始化");
      console.log("初始化 MediaPipe Gesture Recognizer...");
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        console.log("✅ WASM 檔案解析器載入成功。");
        
        gestureRecognizer.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", delegate: "GPU" },
          runningMode: "VIDEO", numHands: 2,
        });
        
        console.log("✅ 手勢辨識模型載入成功！", gestureRecognizer.current);
        setAppState("READY");
        console.log("應用狀態更新為: READY");
      } catch (error: any) {
        console.error("❌ 模型載入失敗:", error);
        setAppState("ERROR");
        setErrorMessage("模型載入失敗，請檢查您的網路連線。");
      }
      console.groupEnd();
    };
    
    createGestureRecognizer();

    // Cleanup function when component unmounts
    return () => {
      cancelAnimationFrame(animationFrameId.current!);
      gestureRecognizer.current?.close();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      console.log("🧹 組件卸載，資源已清理。");
    };
  }, []);

  const handleStartCamera = async () => {
    // DEBUG: 追蹤相機啟動流程
    console.groupCollapsed("2. 階段：啟動相機");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!gestureRecognizer.current || !video || !canvas || !host) {
        console.error("❌ 啟動失敗：Ref 元素尚未準備好。", {
            gestureRecognizer: !!gestureRecognizer.current,
            video: !!video,
            canvas: !!canvas,
            host: !!host
        });
        console.groupEnd();
        return;
    }
    console.log("所有 Ref 元素皆已就緒。");

    const handleResize = () => {
        const videoAspectRatio = video.videoHeight / video.videoWidth;
        const containerWidth = host.clientWidth;
        const containerHeight = host.clientHeight;
        let canvasWidth = containerWidth;
        let canvasHeight = containerWidth * videoAspectRatio;
        if (canvasHeight > containerHeight) {
            canvasHeight = containerHeight;
            canvasWidth = containerHeight / videoAspectRatio;
        }
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // 5. 同時設定 Canvas 的 CSS 顯示尺寸，使其不被拉伸
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
    };
    
    let lastVideoTime = -1;
    let lastGesture = "";
    let lastGestureTime = 0;
    const gestureCooldown = 1000;

    const predictWebcam = () => {
      // DEBUG: 追蹤預測迴圈的前幾幀
      if (predictWebcamFrameCounter < 5) { // 只 log 前 5 幀
        console.groupCollapsed(`4. 階段：預測迴圈 (第 ${predictWebcamFrameCounter + 1} 幀)`);
        console.log(`Video readyState: ${video?.readyState} (需要 >= 2)`);
      }

      if (!video || !canvas || video.readyState < 2) {
        if (predictWebcamFrameCounter < 5) {
          console.warn("Video 尚未準備好，跳過此幀。");
          console.groupEnd();
          predictWebcamFrameCounter++;
        }
        animationFrameId.current = requestAnimationFrame(predictWebcam);
        return;
      }
      
      const ctx = canvas.getContext('2d')!;

      if (video.currentTime !== lastVideoTime && gestureRecognizer.current) {
        lastVideoTime = video.currentTime;
        const results = gestureRecognizer.current.recognizeForVideo(video, Date.now());

        if (predictWebcamFrameCounter < 5) {
            console.log("🧠 辨識結果:", results);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (predictWebcamFrameCounter < 5) {
            console.log("🎨 已將 video 畫面繪製到 canvas。");
        }

        if (results.landmarks && showSkeletonRef.current) {
          const drawingUtils = new DrawingUtils(ctx);
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 5 });
            drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 2 });
          }
        }
        ctx.restore();

        if (results.gestures.length > 0) {
            const topGesture = results.gestures[0][0];
            if (topGesture) {
                const gestureName = topGesture.categoryName;
                const emoji = gestureEmojiMap[gestureName];
                const currentTime = Date.now();
                if (emoji && (gestureName !== lastGesture || currentTime - lastGestureTime > gestureCooldown)) {
                    lastGesture = gestureName;
                    lastGestureTime = currentTime;
                    const wristLandmark = results.landmarks[0][0];
                    const triggerX = canvas.width - wristLandmark.x * canvas.width;
                    const triggerY = wristLandmark.y * canvas.height;
                    for (let i = 0; i < 30; i++) {
                        fireworks.current.push(new EmojiParticle(emoji, triggerX, triggerY));
                    }
                }
            }
        }
      }
      
      fireworks.current = fireworks.current.filter(p => p.isAlive());
      fireworks.current.forEach(p => { p.update(); p.draw(ctx); });
      
      if (predictWebcamFrameCounter < 5) {
        console.groupEnd();
        predictWebcamFrameCounter++;
      }
      animationFrameId.current = requestAnimationFrame(predictWebcam);
    };

    try {
      console.log("正在請求攝影機權限...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log("✅ 成功取得攝影機權限，串流物件:", stream);
      
      video.srcObject = stream;
      video.onloadeddata = () => {
        // DEBUG: 追蹤影像資料是否成功載入
        console.groupCollapsed("3. 階段：影像資料載入");
        console.log(`✅ Video 資料已載入。 影像尺寸: ${video.videoWidth}x${video.videoHeight}`);

        video.play();
        setAppState("RUNNING");
        console.log("應用狀態更新為: RUNNING");
        handleResize();
        window.addEventListener('resize', handleResize);
        
        // 重置計數器
        predictWebcamFrameCounter = 0;
        predictWebcam();
        console.log("🚀 已啟動 predictWebcam 預測迴圈！");
        console.groupEnd();
      };
    } catch (err: any) {
      console.error("❌ 存取攝影機失敗:", err);
      if (err.name === "NotAllowedError") {
        setAppState("PERMISSION_DENIED");
      } else {
        setAppState("ERROR");
        setErrorMessage(err.message || "找不到攝影機或發生未知錯誤。");
      }
    }
    console.groupEnd();
  };

  const renderContent = () => {
    switch (appState) {
      case "LOADING_MODEL":
        return <div className="text-white">Loading AI Model...</div>;
      case "READY":
        return (
          <div className="text-center">
            <h3 className="text-white text-2xl font-bold mb-4">Ready to Go!</h3>
            <p className="text-gray-300 mb-6">Click the button below to start your camera.</p>
            <button
              onClick={handleStartCamera}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105"
            >
              Enable Camera
            </button>
          </div>
        );
      case "PERMISSION_DENIED":
        return (
          <div className="text-center text-white bg-red-800/50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold mb-2">Camera Access Denied</h3>
            <p className="max-w-md">You need to allow camera access to use this feature. Please check your browser's site settings and refresh the page.</p>
          </div>
        );
      case "ERROR":
        return (
           <div className="text-center text-white bg-red-800/50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold mb-2">An Error Occurred</h3>
            <p className="max-w-md">{errorMessage}</p>
          </div>
        );
      case "RUNNING":
        return null; 
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto text-center flex flex-col items-center">
      <div className="w-full px-4">
        <h2 className="text-2xl font-bold my-4">Day 04: Gesture-Triggered Emoji Fireworks</h2>
        <p className="text-gray-600 mb-4">
          Allow camera access, then try making these gestures: 👍, ✌️, 👆, 🖐️, ✊, or 🤟!
        </p>
      </div>
      
      <div 
        ref={hostRef}
        className="relative w-full h-[calc(100vh-12rem)] bg-gray-800 rounded-lg shadow-lg overflow-hidden flex justify-center items-center"
      >
        <video 
  ref={videoRef} 
  className="hidden" // 讓它顯示在左上角
  playsInline 
  muted
/>
        <canvas 
          ref={canvasRef} 
          className={appState !== "RUNNING" ? "hidden" : ""}
        />
        
        {appState !== "RUNNING" && (
          <div className="absolute inset-0 flex justify-center items-center p-4">
            {renderContent()}
          </div>
        )}

        {appState === "RUNNING" && (
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
              <label className="flex items-center space-x-2 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full cursor-pointer hover:bg-black/70 transition-colors">
                  <input 
                      type="checkbox"
                      checked={showSkeleton}
                      onChange={(e) => setShowSkeleton(e.target.checked)}
                      className="form-checkbox h-4 w-4 text-green-500 bg-gray-700 border-gray-600 rounded focus:ring-green-500"
                  />
                  <span>Show Skeleton</span>
              </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default Day04;