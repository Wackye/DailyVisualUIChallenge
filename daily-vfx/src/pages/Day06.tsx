import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
// 直接從 CDN import vision 函式庫，這是我們所有 MediaPipe 功能的來源
import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ====================================================================
// SECTION 1: TYPE DEFINITIONS
// 保持型別定義的整潔
// ====================================================================

// --- MediaPipe 相關型別 ---
interface NormalizedLandmark { x: number; y: number; z: number; visibility?: number; }
interface FaceLandmarkerResult {
  faceLandmarks: NormalizedLandmark[][];
  faceBlendshapes?: any[]; // 根據需求可以定義更精確的型別
}

// --- 元件相關型別 ---
type AppStatus = "loading" | "ready" | "error";

interface WebcamDisplayProps {
  status: AppStatus;
  loadingMessage: string;
}

export interface WebcamDisplayHandles {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

// ====================================================================
// SECTION 2: UI COMPONENTS
// 這些是使用者介面的構成要素
// ====================================================================

/**
 * 狀態覆蓋層 UI 元件
 * @description 當 App 正在載入時，顯示一個半透明的遮罩和提示訊息
 */
const StatusOverlay: React.FC<{ status: AppStatus; message: string }> = ({ status, message }) => {
  if (status !== "loading") return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-gray-900/80 backdrop-blur-sm">
      <p className="animate-pulse text-lg font-semibold text-white">{message}</p>
    </div>
  );
};

/**
 * 攝影機顯示區 UI 元件
 * @description 包含 video 和 canvas 元素，並使用 forwardRef 將它們的 ref 傳遞給父元件
 */
const WebcamDisplay = forwardRef<WebcamDisplayHandles, WebcamDisplayProps>(({ status, loadingMessage }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 透過 useImperativeHandle 將內部 ref 暴露給父元件
  useImperativeHandle(ref, () => ({ videoRef, canvasRef }));

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-900 shadow-xl aspect-video">
      <StatusOverlay status={status} message={loadingMessage} />
      {/* video 元素負責接收攝影機串流，但我們將它隱藏，因為實際顯示的是 canvas */}
      <video ref={videoRef} className="absolute w-full h-full -scale-x-100" autoPlay playsInline style={{ visibility: 'hidden' }}/>
      {/* canvas 元素負責繪製影像和臉部網格 */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
    </div>
  );
});


// ====================================================================
// SECTION 3: MAIN COMPONENT
// 這是應用的主體
// ====================================================================
const Day06 = () => {
  // --- Refs & State ---
  const displayRef = useRef<WebcamDisplayHandles>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AppStatus>("loading");
  const [loadingMessage, setLoadingMessage] = useState("正在準備 AI 模型...");

  // --- Effect 1: 初始化模型並啟動攝影機 ---
  useEffect(() => {
    // 這個 effect 只在元件掛載時執行一次
    const initialize = async () => {
      try {
        console.log("🚀 [步驟 1] 開始初始化 MediaPipe...");
        setLoadingMessage("正在載入 AI 模型檔案...");
        
        // 建立 vision 任務需要的檔案解析器
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        console.log("  ✅ Vision Wasm 檔案解析器建立成功。");

        // 建立 FaceLandmarker 實例
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
        });
        console.log("  ✅ FaceLandmarker 模型建立成功。");

        setStatus("ready");
        console.log("🎉 [步驟 1] 初始化成功！App 狀態更新為 'ready'。");

      } catch (e) {
        console.error("❌ 初始化 MediaPipe 模型時發生錯誤:", e);
        setLoadingMessage("模型載入失敗，請檢查網路或主控台錯誤。");
        setStatus("error");
      }
    };

    initialize();
  }, []);

  // --- Effect 2: 當模型準備好後，啟動攝影機和偵測迴圈 ---
  useEffect(() => {
    if (status !== "ready" || !displayRef.current?.videoRef.current || !displayRef.current?.canvasRef.current) {
      return;
    }
    
    console.log("🚀 [步驟 2] 模型已就緒，準備啟動攝影機。");
    const video = displayRef.current.videoRef.current;
    const canvas = displayRef.current.canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error("無法取得 Canvas 2D context");
        return;
    }

    const drawingUtils = new DrawingUtils(ctx);

    const startWebcam = async () => {
      try {
        console.log("  [步驟 2.1] 正在請求攝影機權限...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        video.srcObject = stream;
        // 監聽 'loadeddata' 事件，確保影片第一幀載入後才開始偵測
        video.addEventListener("loadeddata", startPredictionLoop);
        console.log("  ✅ 攝影機權限已獲取，串流已連結。");
      } catch (err) {
        console.error("❌ 獲取攝影機權限失敗:", err);
        setLoadingMessage("無法啟用攝影機，請檢查權限。");
        setStatus("error");
      }
    };

    let lastVideoTime = -1;
    const startPredictionLoop = () => {
        const landmarker = faceLandmarkerRef.current;
        if (!landmarker) return;

        console.log("    [步驟 2.2] 影片數據已載入，開始偵測迴圈。");

        const predict = () => {
            // 如果影片串流不存在、暫停或已結束，則跳過此幀
            if (!video.srcObject || video.paused || video.ended) {
                animationFrameIdRef.current = requestAnimationFrame(predict);
                return;
            }

            // 只有在影片時間戳更新時才進行偵測，避免重複運算
            if (video.currentTime !== lastVideoTime) {
                lastVideoTime = video.currentTime;
                
                // 執行臉部偵測
                const results: FaceLandmarkerResult = landmarker.detectForVideo(video, Date.now());

                // 同步 canvas 和 video 的尺寸
                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                // 清空畫布並繪製當前影像
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // 如果偵測到臉部，就繪製網格
                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                  for (const landmarks of results.faceLandmarks) {
                    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 0.5 });
                    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_CONTOURS, { color: "#4dffc9", lineWidth: 1 });
                  }
                }
            }
            animationFrameIdRef.current = requestAnimationFrame(predict);
        };
        predict();
    };

    startWebcam();

    // --- 清理函式 ---
    return () => {
      console.log("🧹 [清理] 正在清理攝影機與偵測迴圈資源...");
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      video.removeEventListener("loadeddata", startPredictionLoop);
      if (video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach(track => track.stop());
        console.log("  -> 攝影機串流已停止。");
      }
    };
  }, [status]); // 這個 effect 會在 status 變為 'ready' 時觸發

  // --- Render ---
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center p-4 font-sans text-white">
        <h1 className="text-center text-3xl font-bold tracking-tight">
          AI 臉部特徵偵測
        </h1>
        <WebcamDisplay 
          ref={displayRef} 
          status={status}
          loadingMessage={loadingMessage}
        />
        {status === "error" && (
            <div className="rounded-md bg-red-900/50 p-4 text-center text-red-300">
                <p>發生錯誤：{loadingMessage}</p>
                <p className="text-sm mt-1">請允許攝影機權限，並確認您的瀏覽器支援 WebGL/WASM。</p>
            </div>
        )}
    </div>
  );
};

export default Day06;
