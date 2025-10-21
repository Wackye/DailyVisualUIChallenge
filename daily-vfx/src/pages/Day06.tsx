import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
// MediaPipe
import {
  FaceLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
// Three.js
import * as THREE from "https://esm.sh/three@0.169.0/build/three.module.js";
import { GLTFLoader } from "https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

// ====================================================================
// SECTION 1: TYPE DEFINITIONS
// ====================================================================

interface NormalizedLandmark { x: number; y: number; z: number; visibility?: number; }
interface BlendshapeCategory {
  index: number;
  score: number;
  categoryName: string;
  displayName: string;
}
interface FaceLandmarkerResult {
  faceLandmarks: NormalizedLandmark[][];
  faceBlendshapes?: {
    headIndex: number;
    categories: BlendshapeCategory[];
  }[];
}

type AppStatus = "loading" | "ready" | "error";
const NUM_BITCOINS = 60;
const BITCOIN_SCALE = 0.001;

interface WebcamDisplayProps {
  status: AppStatus;
  loadingMessage: string;
}

const mapRangeClamped = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
) => {
  const t = Math.min(Math.max((v - inMin) / (inMax - inMin), 0), 1);
  return outMin + t * (outMax - outMin);
};

export interface WebcamDisplayHandles {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  threeCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

// ====================================================================
// SECTION 2: UI COMPONENTS
// ====================================================================

const StatusOverlay: React.FC<{ status: AppStatus; message: string }> = ({ status, message }) => {
  if (status !== "loading") return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-gray-900/80 backdrop-blur-sm">
      <p className="animate-pulse text-lg font-semibold text-white">{message}</p>
    </div>
  );
};

const WebcamDisplay = forwardRef<WebcamDisplayHandles, WebcamDisplayProps>(({ status, loadingMessage }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({ videoRef, canvasRef, threeCanvasRef }));

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-900 shadow-xl aspect-video">
      <StatusOverlay status={status} message={loadingMessage} />
      <video
        ref={videoRef}
        className="absolute w-full h-full -scale-x-100"
        autoPlay
        playsInline
        style={{ visibility: "hidden" }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 h-full w-full -scale-x-100 pointer-events-none"
      />
      <canvas
        ref={threeCanvasRef}
        className="absolute inset-0 z-20 h-full w-full -scale-x-100 pointer-events-none"
      />
    </div>
  );
});
WebcamDisplay.displayName = "WebcamDisplay";

// ====================================================================
// SECTION 3: MAIN COMPONENT
// ====================================================================

const Day06 = () => {
  const displayRef = useRef<WebcamDisplayHandles>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AppStatus>("loading");
  const [loadingMessage, setLoadingMessage] = useState("正在準備 AI 模型...");
  const [mouthOpenScore, setMouthOpenScore] = useState(0);

  // ✅ 單一開關：Debug info
  const [showDebug, setShowDebug] = useState(false);
  const showDebugRef = useRef(showDebug);
  useEffect(() => { showDebugRef.current = showDebug; }, [showDebug]);

  // Three.js
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelsGroupRef = useRef<THREE.Group | null>(null);
  const mouthCubeRef = useRef<THREE.Mesh | null>(null); // 紅色 3D Cube
  const clockRef = useRef(new THREE.Clock());
  // --- 初始化 MediaPipe ---
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoadingMessage("正在載入 AI 模型檔案...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
        });
        setStatus("ready");
      } catch (e) {
        console.error(e);
        setLoadingMessage("模型載入失敗，請檢查網路或主控台錯誤。");
        setStatus("error");
      }
    };
    initialize();
  }, []);

  // --- 當 ready 後啟動攝影機、3D 場景與迴圈 ---
  useEffect(() => {
    if (
      status !== "ready" ||
      !displayRef.current?.videoRef.current ||
      !displayRef.current?.canvasRef.current ||
      !displayRef.current.threeCanvasRef.current
    ) {
      return;
    }

    const { videoRef, canvasRef, threeCanvasRef } = displayRef.current;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const threeCanvas = threeCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const drawingUtils = new DrawingUtils(ctx);

    // --- Three.js 場景 ---
    const scene = sceneRef.current;

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, threeCanvas.clientWidth) / Math.max(1, threeCanvas.clientHeight),
      0.1,
      1000
    );
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(threeCanvas.clientWidth, threeCanvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // ✅ 色彩與曝光
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;          // 可微調 1.0 ~ 1.6
    renderer.physicallyCorrectLights = true;

    // （可選）若要陰影，開啟下列兩行
    // renderer.shadowMap.enabled = true;
    // renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    rendererRef.current = renderer;

    // ✅ 補光組合：環境光 + 天光 + 主光
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 4, 5);
    // （可選）需要陰影時再開
    // dirLight.castShadow = true;
    // dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    // 紅色 3D Cube：嘴巴“跟隨者”
    {
      const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.2, roughness: 0.4 });
      mouthCubeRef.current = new THREE.Mesh(geo, mat);
      mouthCubeRef.current.position.set(0, 0, 0);
      mouthCubeRef.current.visible = showDebugRef.current; // 以當前 debug 狀態初始化
      scene.add(mouthCubeRef.current);
    }

    // 粒子模型（bitcoin）：預設漂浮
    const loader = new GLTFLoader();
    loader.load(
      "/models/bitcoin.glb",
      (gltf: any) => {
        const group = new THREE.Group();
        for (let i = 0; i < NUM_BITCOINS; i++) {
          const model = gltf.scene.clone();
          model.scale.set(BITCOIN_SCALE, BITCOIN_SCALE, BITCOIN_SCALE);
          model.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5);
          (model as any).userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01,
            0
          );
          (model as any).userData.angular = new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,  // x 軸角速度（弧度/秒）
            (Math.random() - 0.5) * 0.8,  // y
            (Math.random() - 0.5) * 0.8   // z
          );

          group.add(model);
        }
        modelsGroupRef.current = group;
        scene.add(modelsGroupRef.current);
      },
      undefined,
      (error) => console.error("GLTF 載入失敗:", error)
    );

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const w = threeCanvas.clientWidth || threeCanvas.width || 1;
      const h = threeCanvas.clientHeight || threeCanvas.height || 1;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // --- 影像與推論迴圈 ---
    let lastVideoTime = -1;

    const startPredictionLoop = () => {
      const landmarker = faceLandmarkerRef.current;
      if (!landmarker) return;

      const PREFERRED_DISTANCE = 3; // 立方體/目標點與相機距離
      const OPEN_THRESHOLD = 0.02;  // 認定“張嘴”的閾值

      const predict = () => {
        if (!video.srcObject || video.paused || video.ended) {
          animationFrameIdRef.current = requestAnimationFrame(predict);
          return;
        }

        const dt = clockRef.current.getDelta(); // 秒

        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          const results: FaceLandmarkerResult = landmarker.detectForVideo(video, Date.now());

          // 同步畫布大小（2D 疊層）
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // 畫原始影像
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // 👉 Debug info: 畫臉部 connectors（若關閉 debug，這段不畫）
          if (showDebugRef.current && results.faceLandmarks) {
            for (const landmarks of results.faceLandmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                { color: "#C0C0C070", lineWidth: 0.5 }
              );
              drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_CONTOURS,
                { color: "#4dffc9", lineWidth: 1 }
              );
            }
          }

          // jawOpen 分數（不論 debug 與否都計算，以供行為使用）
          let jawOpen = 0;
          if (results.faceBlendshapes?.[0]) {
            const j = results.faceBlendshapes[0].categories.find(s => s.categoryName === "jawOpen");
            if (j) {
              jawOpen = j.score;
              setMouthOpenScore(jawOpen);
            }
          }

          // 目標點（嘴巴中心）→ 世界座標 targetPos
          let targetPos: THREE.Vector3 | null = null;

          if (results.faceLandmarks?.[0] && cameraRef.current) {
            const landmarks = results.faceLandmarks[0];
            const upperLip = landmarks[13];
            const lowerLip = landmarks[14];

            // MediaPipe [0,1] → NDC [-1,1]（Y 軸反轉）
            const ndcX = ((upperLip.x + lowerLip.x) * 0.5) * 2 - 1;
            const ndcY = -(((upperLip.y + lowerLip.y) * 0.5) * 2 - 1);

            // 取 z=0.5 的 NDC 點 unproject 成世界座標，推到固定距離
            const ndcPoint = new THREE.Vector3(ndcX, ndcY, 0.5);
            ndcPoint.unproject(cameraRef.current);
            const dir = ndcPoint.sub(cameraRef.current.position).normalize();
            const worldPos = cameraRef.current.position.clone().add(dir.multiplyScalar(PREFERRED_DISTANCE));
            targetPos = worldPos;

            // 👉 Debug info: 紅色 3D 方塊可視/更新
            if (mouthCubeRef.current) {
              mouthCubeRef.current.visible = showDebugRef.current;
              if (showDebugRef.current) {
                mouthCubeRef.current.position.copy(worldPos);
                const base = 0.18;
                const s = base + 0.5 * Math.max(0, Math.min(1, jawOpen));
                mouthCubeRef.current.scale.setScalar(s / 0.25);
              }
            }
          }

          // === Bitcoin 行為：平時漂浮、張嘴時飛向 targetPos（不受 debug 顯示影響）===
          if (modelsGroupRef.current) {
            modelsGroupRef.current.children.forEach((model: any) => {
              if (!model.userData.velocity) {
                model.userData.velocity = new THREE.Vector3(
                  (Math.random() - 0.5) * 0.01,
                  (Math.random() - 0.5) * 0.01,
                  0
                );
              }
              // compute once per frame after you have jawOpen
              const lerpT = mapRangeClamped(jawOpen, 0.2, 0.5, 0.02, 0.15);

              if (jawOpen > OPEN_THRESHOLD && targetPos) {
                // 嘴巴張開：往 targetPos 飛
                model.position.lerp(targetPos, lerpT);

                // 靠近後重置位置與大小
                if (model.position.distanceTo(targetPos) < 0.3) {
                  model.position.set(
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 6,
                    (Math.random() - 0.5) * 5
                  );
                  model.scale.set(BITCOIN_SCALE, BITCOIN_SCALE, BITCOIN_SCALE);
                }
              } else {
                // 嘴巴閉合：維持漂浮（含邊界反彈）
                model.position.add(model.userData.velocity);
                if (model.position.x > 5 || model.position.x < -5) model.userData.velocity.x *= -1;
                if (model.position.y > 3 || model.position.y < -3) model.userData.velocity.y *= -1;

                // 🔁 微旋轉（Euler）
                const ang: THREE.Vector3 = model.userData.angular;
                model.rotation.z += ang.z * dt;
              }
            });
          }
        }

        // 繪製 3D
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }

        // 下一禎
        animationFrameIdRef.current = requestAnimationFrame(predict);
      };

      animationFrameIdRef.current = requestAnimationFrame(predict);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        video.srcObject = stream;
        video.addEventListener("loadeddata", startPredictionLoop);
      } catch (err) {
        console.error("getUserMedia 失敗:", err);
        setLoadingMessage("無法啟用攝影機，請檢查權限。");
        setStatus("error");
      }
    })();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (video.srcObject) (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      video.srcObject = null;
    };
  }, [status]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-4 p-4">
      <h1 className="text-3xl font-bold text-gray-800">Earn Your Own Bitcoin</h1>
      <p className="text-gray-600 text-center">
      Catch the coins with your mouth.
      </p>

      <div className="w-full relative">
        <div className="w-full bg-gray-900 rounded-lg overflow-hidden shadow-2xl border-4 border-gray-300">
          <WebcamDisplay ref={displayRef} status={status} loadingMessage={loadingMessage} />
        </div>

        {status === "ready" && (
          <div
            className="absolute top-4 right-4 z-50 pointer-events-auto flex items-center gap-2
                       bg-slate-700/50 backdrop-blur px-3 py-2 rounded-lg text-white"
          >
            <input
              id="debugToggle"
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            <label htmlFor="debugToggle" className="cursor-pointer select-none">
              Debug info
            </label>
          </div>
        )}

        {status === "ready" && showDebug && (
          <div className="absolute top-4 left-4 z-40 p-2 text-white font-mono text-2xl bg-black/50 rounded-lg">
            {mouthOpenScore.toFixed(2)}
          </div>
        )}
      </div>
      <small>Bitcoin 3D model is made by <a href="https://sketchfab.com/3d-models/low-poly-bitcoin-ec0b85df2dde42eda90b571c12a7cd47"> Gohar.Munir from sketchfab, CC 4.0 license</a>.</small>
      <div className="h-24 flex flex-col items-center justify-center gap-4">
        {status === "loading" && <div className="text-slate-600">Loading model…</div>}
        {status === "error" && <div className="text-red-600">{loadingMessage}</div>}
      </div>

    </div>
  );
};

export default Day06;
