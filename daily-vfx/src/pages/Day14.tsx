// src/days/Day14.tsx
import { useEffect, useRef, useState } from "react";
import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

// -------------------- 常數 --------------------
type AppState = "LOADING_MODEL" | "READY" | "RUNNING" | "PERMISSION_DENIED" | "ERROR";

const POINTER_COLOR = "#067AF5";
const POINTER_RADIUS = 10;
const POINTER_GRACE_MS = 200;      // pointing 中斷 200ms 內維持顯示
const SMOOTH_ALPHA = 0.35;

// 翻頁動畫
const PAGE_ANIM_MS = 300; // slide-in/out
// 縮放動畫
const SCALE_ANIM_MS = 300; // ease-in

// Swipe（只在「比5」時檢測，且不能在 scale 鎖定時）
const SWIPE_WINDOW_MS = 200;     // 取最近 200ms 的相對位移
const SWIPE_MIN_PX = 120;        // 以 1280 寬為基準的 dx 門檻（較鬆）
const SWIPE_COOLDOWN_MS = 400;   // 翻頁後冷卻時間

// Scale（成對手勢：Closed_Fist -> Open_Palm 放大；Open_Palm -> Closed_Fist 縮小）
const SCALE_TARGET_ZOOM_IN = 2.0;
const SCALE_TARGET_ZOOM_OUT = 1.0;
const SCALE_PAIR_WINDOW_MS = 550; // 先後兩個手勢需在此時間窗內
const SCALE_LOCK_MS = 900;        // 觸發後鎖定期，避免回彈又反向觸發
const PAN_ALPHA = 0.8;            // 放大狀態下，握拳拖曳畫布的靈敏度（0~1）

// Drag UI
const DRAG_UI_START_R = 6;
const DRAG_UI_CURR_R = 14;

// -------------------- 小工具 --------------------
type LM = { x: number; y: number; z: number };

// 僅用 landmarks 寬鬆判定（食指伸直、其餘彎曲）——作為 pointing 的 backup；
// 但主邏輯仍以 Mediapipe 的 "Pointing_Up" 類別優先
const dist2 = (a: LM, b: LM) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const isFingerExtended = (mcp: LM, pip: LM, dip: LM, tip: LM) => {
  const dTip = dist2(tip, mcp);
  const dPip = dist2(pip, mcp);
  const dDip = dist2(dip, mcp);
  const monotonic = dPip < dDip && dDip < dTip;
  return monotonic && dTip > dPip * 1.3;
};
const isOneGestureLoose = (lms: LM[]) => {
  const wrist = lms[0];
  const idx = { mcp: lms[5], pip: lms[6], dip: lms[7], tip: lms[8] };
  const mid = { mcp: lms[9], pip: lms[10], dip: lms[11], tip: lms[12] };
  const rng = { mcp: lms[13], pip: lms[14], dip: lms[15], tip: lms[16] };
  const lit = { mcp: lms[17], pip: lms[18], dip: lms[19], tip: lms[20] };
  const thb = { mcp: lms[1], pip: lms[2], dip: lms[3], tip: lms[4] };

  const idxExt = isFingerExtended(idx.mcp, idx.pip, idx.dip, idx.tip);
  const curled = (f: any) => dist2(f.tip, f.mcp) < dist2(f.pip, f.mcp) * 1.15;
  const midCurled = curled(mid), rngCurled = curled(rng), litCurled = curled(lit);
  const thbOk = dist2(thb.tip, wrist) < dist2(idx.mcp, wrist) * 0.95;
  return idxExt && midCurled && rngCurled && litCurled && thbOk;
};

// -------------------- 主組件 --------------------
export default function Day14() {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRecognizer = useRef<GestureRecognizer | null>(null);
  const animationId = useRef<number | null>(null);

  const [appState, setAppState] = useState<AppState>("LOADING_MODEL");
  const [errMsg, setErrMsg] = useState("");

  // Debug / 可視化
  const [debug, setDebug] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  // Slides（改為 9 張）
  const slidesRef = useRef<HTMLImageElement[]>([]);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  useEffect(() => { pageRef.current = page; }, [page]);

  // 翻頁動畫
  const pageAnim = useRef<null | { dir: "left" | "right"; from: number; to: number; start: number }>(null);

  // 縮放狀態與動畫
  const zoomRef = useRef(1.0);
  const panRef = useRef({ x: 0, y: 0 });         // 畫布偏移（縮放後允許拖曳）
  const scaleAnim = useRef<null | { from: number; to: number; start: number }>(null);
  const scaleLockUntil = useRef(0);              // 在這之前不再觸發 scale
  const scalePair = useRef<{ first: "FIST" | "PALM" | null; t: number; startPos?: { x: number; y: number } }>({
    first: null, t: 0,
  });

  // Pointer（200ms grace + 平滑）
  const pointer = useRef({ visible: false, x: 0, y: 0, sx: 0, sy: 0, inited: false, lastSeen: 0 });

  // Swipe 緩衝（用「中指指尖 - 手腕」的**鏡像後**相對 X）
  const swipe = useRef({
    hist: [] as { t: number; relX: number }[],
    lastFired: 0,
  });

  // [NEW] Drag UI 狀態
  const dragUI = useRef<{
    active: boolean;
    uiStart: { x: number; y: number };   // 畫面中心
    uiCurr: { x: number; y: number };    // 當前空心圓位置
    fistStart: { x: number; y: number }; // 第一次 close-fist 時的拳頭 canvas 座標
  }>({
    active: false,
    uiStart: { x: 0, y: 0 },
    uiCurr: { x: 0, y: 0 },
    fistStart: { x: 0, y: 0 },
  });

  // Debug flags
  const dbg = useRef({ pointing: false, swipeL: false, swipeR: false, scaleUp: false, scaleDown: false });

  // -------------------- 初始化：載圖 + 模型 --------------------
  useEffect(() => {
    let mounted = true;

    const preloadSlides = async () => {
      const paths = Array.from({ length: 9 }, (_, i) => `/day14/${i + 1}.png`);
      const imgs: HTMLImageElement[] = [];
      await Promise.all(
        paths.map(
          (src) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => { imgs.push(img); resolve(); };
              img.onerror = () => resolve();
              img.src = src;
            })
        )
      );
      slidesRef.current = imgs;
      if (!imgs.length) console.warn("No slides loaded from /day14");
    };

    const boot = async () => {
      try {
        await preloadSlides();
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        const gr = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (!mounted) return;
        gestureRecognizer.current = gr;
        setAppState("READY");
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setAppState("ERROR");
        setErrMsg(e?.message ?? "Failed to initialize model");
      }
    };

    boot();

    return () => {
      mounted = false;
      if (animationId.current) cancelAnimationFrame(animationId.current);
      gestureRecognizer.current?.close();
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // -------------------- 相機 --------------------
  const startCamera = async () => {
    if (!gestureRecognizer.current) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const host = hostRef.current!;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      video.onloadeddata = () => {
        video.play();
        setAppState("RUNNING");

        const resize = () => {
          const baseW = slidesRef.current[0]?.width || video.videoWidth || 1280;
          const baseH = slidesRef.current[0]?.height || video.videoHeight || 720;
          const aspect = baseH / baseW;

          const cw = host.clientWidth;
          const ch = host.clientHeight;
          let w = cw, h = w * aspect;
          if (h > ch) { h = ch; w = h / aspect; }
          canvas.width = w; canvas.height = h;
          canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
        };

        resize();
        window.addEventListener("resize", resize);

        const loop = () => {
          drawFrame();
          animationId.current = requestAnimationFrame(loop);
        };
        if (animationId.current) cancelAnimationFrame(animationId.current);
        loop();
      };
    } catch (err: any) {
      console.error(err);
      if (err?.name === "NotAllowedError") setAppState("PERMISSION_DENIED");
      else { setAppState("ERROR"); setErrMsg(err?.message ?? "Camera error"); }
    }
  };

  // -------------------- 翻頁控制（含動畫） --------------------
  const startAnimTo = (to: number, dir: "left" | "right") => {
    const n = slidesRef.current.length;
    if (!n) return;
    const clamped = Math.max(0, Math.min(to, n - 1));
    if (clamped === pageRef.current) return;
    pageAnim.current = { dir, from: pageRef.current, to: clamped, start: performance.now() };
  };

  const nextPage = () => {
    const n = slidesRef.current.length;
    if (!n) return;
    startAnimTo(Math.min(pageRef.current + 1, n - 1), "left"); // 新頁從右插入
  };
  const prevPage = () => {
    const n = slidesRef.current.length;
    if (!n) return;
    startAnimTo(Math.max(pageRef.current - 1, 0), "right"); // 新頁從左插入
  };

  // -------------------- Scale 觸發（動作成對 + 鎖定期） --------------------
  const triggerScaleTo = (target: number) => {
    const from = zoomRef.current;
    if (Math.abs(from - target) < 1e-3) return;
    scaleAnim.current = { from, to: target, start: performance.now() };
    scaleLockUntil.current = performance.now() + SCALE_LOCK_MS;
    if (target === SCALE_TARGET_ZOOM_OUT) {
      // 縮回時重置平移
      panRef.current = { x: 0, y: 0 };
    }
  };

  // -------------------- Swipe（用中指 tip 與手腕的鏡像相對 X） --------------------
  const tryDetectSwipe = (now: number, relXCanvas: number, canvasWidth: number) => {
    const h = swipe.current.hist;
    const cutoff = now - SWIPE_WINDOW_MS;
    h.push({ t: now, relX: relXCanvas });
    while (h.length && h[0].t < cutoff) h.shift();
    if (h.length < 2) return;

    const first = h[0], last = h[h.length - 1];
    const dx = last.relX - first.relX;
    const minDx = (SWIPE_MIN_PX / 1280) * canvasWidth;

    if (now - swipe.current.lastFired < SWIPE_COOLDOWN_MS) return;

    // 方向：使用「鏡像後相對 X」的變化：
    // dx < 0: 往左 → 下一頁（Swipe Left）
    // dx > 0: 往右 → 上一頁（Swipe Right）
    if (dx <= -minDx) {
      swipe.current.lastFired = now;
      dbg.current.swipeL = true; dbg.current.swipeR = false;
      nextPage();
      swipe.current.hist.length = 0;
    } else if (dx >= minDx) {
      swipe.current.lastFired = now;
      dbg.current.swipeR = true; dbg.current.swipeL = false;
      prevPage();
      swipe.current.hist.length = 0;
    }
  };

  // -------------------- 主繪製回圈 --------------------
  const drawFrame = () => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const gr = gestureRecognizer.current!;
    const now = performance.now();

    // 清背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 計算當前 zoom（含動畫）
    if (scaleAnim.current) {
      const t = Math.min(1, (now - scaleAnim.current.start) / SCALE_ANIM_MS);
      // easeInCubic
      const ease = t * t * t;
      zoomRef.current = scaleAnim.current.from + (scaleAnim.current.to - scaleAnim.current.from) * ease;
      if (t >= 1) scaleAnim.current = null;
    }

    // 畫投影片（含翻頁動畫 + 縮放 + 平移）
    const drawSlideFit = (img: HTMLImageElement, offsetX = 0, zoom = 1, panX = 0, panY = 0) => {
      if (!img) return;
      const cw = canvas.width, ch = canvas.height;
      const iw = img.width, ih = img.height;
      const ir = iw / ih, cr = cw / ch;
      let dw = cw, dh = ch;
      if (ir > cr) { dw = cw; dh = dw / ir; } else { dh = ch; dw = dh * ir; }
      // 縮放中心取畫面中心，再加 pan
      dw *= zoom; dh *= zoom;
      const dx = (cw - dw) / 2 + offsetX + panX;
      const dy = (ch - dh) / 2 + panY;
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    if (pageAnim.current) {
      const a = pageAnim.current;
      const t = Math.min(1, (now - a.start) / PAGE_ANIM_MS);
      // easeInOutQuad
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const dirFactor = a.dir === "left" ? -1 : 1;
      const shift = canvas.width * (1 - ease);

      drawSlideFit(slidesRef.current[a.from], dirFactor * (canvas.width - shift), zoomRef.current, panRef.current.x, panRef.current.y);
      drawSlideFit(slidesRef.current[a.to], -dirFactor * shift, zoomRef.current, panRef.current.x, panRef.current.y);

      if (t >= 1) {
        setPage(a.to);
        pageRef.current = a.to;
        pageAnim.current = null;
      }
    } else {
      drawSlideFit(slidesRef.current[pageRef.current], 0, zoomRef.current, panRef.current.x, panRef.current.y);
    }

    // 視訊/骨架（可切換）
    if (showVideo) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // 取得手部推論
    let results: any = null;
    if (video.readyState >= 2) {
      results = gr.recognizeForVideo(video, now);
    }

    // reset debug flags (維持 1 frame 閃爍)
    dbg.current.pointing = false;
    dbg.current.swipeL = false;
    dbg.current.swipeR = false;
    dbg.current.scaleUp = false;
    dbg.current.scaleDown = false;

    // ---- 手勢處理：僅取第一隻手（可擴充多手）----
    if (results?.landmarks?.length) {
      const lms: LM[] = results.landmarks[0];
      const gestures = results.gestures?.[0] ?? [];
      const topGestureName: string | undefined = gestures[0]?.categoryName;

      const wrist = lms[0];
      const midTip = lms[12]; // 中指指尖

      // 座標換算（鏡像）
      const toX = (nx: number) => canvas.width - nx * canvas.width;
      const toY = (ny: number) => ny * canvas.height;

      const tipCanvasX = toX(midTip.x);
      const wristCanvasX = toX(wrist.x);
      const relX = tipCanvasX - wristCanvasX;

      // 可視化骨架
      if (showSkeleton) {
        const du = new DrawingUtils(ctx);
        du.drawConnectors(lms as any, (GestureRecognizer as any).HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
        du.drawLandmarks(lms as any, { color: "#FF0000", lineWidth: 1 });
      }

      // --------- 優先序：Pointing（雷射） > Scale 成對動作 > Swipe ----------
      // Pointing：優先使用模型的 "Pointing_Up"，退而求其次用 landmarks 寬鬆判定
      const isPointing =
        topGestureName === "Pointing_Up" || isOneGestureLoose(lms);

      if (isPointing) {
        const indexTip = lms[8];
        const px = toX(indexTip.x);
        const py = toY(indexTip.y);

        if (!pointer.current.inited) {
          pointer.current.sx = px; pointer.current.sy = py; pointer.current.inited = true;
        } else {
          pointer.current.sx = pointer.current.sx + SMOOTH_ALPHA * (px - pointer.current.sx);
          pointer.current.sy = pointer.current.sy + SMOOTH_ALPHA * (py - pointer.current.sy);
        }
        pointer.current.x = px; pointer.current.y = py;
        pointer.current.lastSeen = now;
        pointer.current.visible = true;
        dbg.current.pointing = true;

        // pointing 中不進行 scale pair 的第一步記錄，避免互搶
      } else {
        // --- Scale pair 檢測（僅在未鎖定時）---
        const locked = now < scaleLockUntil.current;
        const isFist = topGestureName === "Closed_Fist";
        const isPalm = topGestureName === "Open_Palm";

        // 允許在縮放狀態下，握拳拖曳畫布（pan）
        if (zoomRef.current > 1.001 && isFist) {
          // 握拳第一次登記起點
          if (!scalePair.current.startPos) {
            scalePair.current.startPos = { x: toX(wrist.x), y: toY(wrist.y) };
          } else {
            const cur = { x: toX(wrist.x), y: toY(wrist.y) };
            const dx = (cur.x - scalePair.current.startPos.x) * PAN_ALPHA;
            const dy = (cur.y - scalePair.current.startPos.y) * PAN_ALPHA;
            panRef.current = { x: dx, y: dy };
          }
        } else {
          scalePair.current.startPos = undefined;
        }

        if (!locked) {
          // 記錄第一個手勢（FIST / PALM）
          if (!scalePair.current.first && (isFist || isPalm)) {
            scalePair.current.first = isFist ? "FIST" : "PALM";
            scalePair.current.t = now;
          }
          // 檢查時間窗與成對手勢
          if (scalePair.current.first && now - scalePair.current.t <= SCALE_PAIR_WINDOW_MS) {
            // FIST -> PALM => 放大
            if (scalePair.current.first === "FIST" && isPalm && zoomRef.current < SCALE_TARGET_ZOOM_IN - 1e-3) {
              triggerScaleTo(SCALE_TARGET_ZOOM_IN);
              dbg.current.scaleUp = true;
              scalePair.current.first = null; // 重置配對
            }
            // PALM -> FIST => 縮小
            else if (scalePair.current.first === "PALM" && isFist && zoomRef.current > SCALE_TARGET_ZOOM_OUT + 1e-3) {
              triggerScaleTo(SCALE_TARGET_ZOOM_OUT);
              dbg.current.scaleDown = true;
              scalePair.current.first = null;
            }
          }
          // 逾時重置
          if (scalePair.current.first && now - scalePair.current.t > SCALE_PAIR_WINDOW_MS) {
            scalePair.current.first = null;
          }
        }

        // --- Swipe：僅在「比 5」時檢測，且不在 scale 鎖定期 ---
        if (!locked && topGestureName === "Open_Palm") {
          tryDetectSwipe(now, relX, canvas.width);
        }
      }
    }

    // 抗閃爍（指標）
    if (now - pointer.current.lastSeen > POINTER_GRACE_MS) {
      pointer.current.visible = false;
    }

    // 疊加 Pointer
    if (pointer.current.visible) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pointer.current.sx, pointer.current.sy, POINTER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = POINTER_COLOR;
      ctx.shadowColor = POINTER_COLOR;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    // [NEW] 疊加 Drag UI（最後畫，確保在最上層）
    if (dragUI.current.active) {
      ctx.save();
      // 起始點：藍色實心圓
      ctx.beginPath();
      ctx.arc(dragUI.current.uiStart.x, dragUI.current.uiStart.y, DRAG_UI_START_R, 0, Math.PI * 2);
      ctx.fillStyle = POINTER_COLOR;
      ctx.fill();

      // 當前點：藍色空心圓
      ctx.beginPath();
      ctx.arc(dragUI.current.uiCurr.x, dragUI.current.uiCurr.y, DRAG_UI_CURR_R, 0, Math.PI * 2);
      ctx.strokeStyle = POINTER_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Debug 面板
    if (debug) {
      const lines = [
        `page: ${pageRef.current + 1}/${slidesRef.current.length || 0}`,
        `zoom: ${zoomRef.current.toFixed(2)}${performance.now() < scaleLockUntil.current ? " (locked)" : ""}`,
        `pointing: ${dbg.current.pointing ? "ON" : "off"}`,
        `swipeL(next): ${dbg.current.swipeL ? "TRIGGER" : "-"}`,
        `swipeR(prev): ${dbg.current.swipeR ? "TRIGGER" : "-"}`,
        `scaleUp: ${dbg.current.scaleUp ? "TRIGGER" : "-"}`,
        `scaleDown: ${dbg.current.scaleDown ? "TRIGGER" : "-"}`,
      ];
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(10, 10, 230, 110);
      ctx.fillStyle = "#fff";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      lines.forEach((t, i) => ctx.fillText(t, 18, 28 + i * 16));
      ctx.restore();
    }
  };

  // -------------------- UI --------------------
  const gate = () => {
    switch (appState) {
      case "LOADING_MODEL":
        return <div className="text-white">Loading AI Model…</div>;
      case "READY":
        return (
          <div className="text-center">
            <h3 className="text-white text-2xl font-bold mb-4">Day 14 — Air-Gesture Slides PoC</h3>
            <p className="text-gray-300 mb-4">
              打開攝影機後：<br />
              「Pointing_Up」會顯示藍色指標；<br />
              「Closed_Fist → Open_Palm」放大（一次到 150%）；「Open_Palm → Closed_Fist」縮小回 100%；<br />
              「比 5」扇一下（外→內）可翻頁：左（下一頁）/ 右（上一頁）。
            </p>
            <button
              onClick={startCamera}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg"
            >
              Enable Camera
            </button>
          </div>
        );
      case "PERMISSION_DENIED":
        return (
          <div className="text-center text-white bg-red-800/50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold mb-2">Camera Access Denied</h3>
            <p>請在瀏覽器設定中允許相機存取，並重新整理頁面。</p>
          </div>
        );
      case "ERROR":
        return (
          <div className="text-center text-white bg-red-800/50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold mb-2">An Error Occurred</h3>
            <p className="max-w-md mx-auto">{errMsg}</p>
          </div>
        );
      default:
        return null;
    }
  };

  const total = slidesRef.current.length || 0;

  return (
    <div className="w-full max-w-7xl mx-auto text-center flex flex-col items-center">
      <div className="w-full px-4">
        <h2 className="text-2xl font-bold my-4">Day 14: Air-Gesture Slides (Pointing + Scale + Swipe)</h2>
        <p className="text-gray-600 mb-2">
          圖片放在：<code>/public/day14/1.png … 9.png</code>
        </p>
      </div>

      <div
        ref={hostRef}
        className="relative w-full h-[calc(100vh-12rem)] bg-gray-900 rounded-lg shadow-lg overflow-hidden flex justify-center items-center"
      >
        {/* 視訊（預設隱藏） */}
        <video
          ref={videoRef}
          className={showVideo ? "absolute top-2 left-2 w-48 rounded-md" : "hidden"}
          playsInline
          muted
        />
        {/* 畫布 */}
        <canvas ref={canvasRef} className={appState === "RUNNING" ? "" : "hidden"} />

        {/* Gate */}
        {appState !== "RUNNING" && (
          <div className="absolute inset-0 flex justify-center items-center p-4">
            {gate()}
          </div>
        )}

        {/* 頁碼 / 控制 */}
        {appState === "RUNNING" && (
          <>
            <div className="absolute top-3 right-4 text-white/90 text-sm bg-black/40 px-3 py-1 rounded-full">
              Page {pageRef.current + 1} / {total || 0}
            </div>

            <div className="absolute bottom-3 right-4 flex gap-2">
              <button
                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md"
                onClick={prevPage}
              >
                Prev
              </button>
              <button
                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md"
                onClick={nextPage}
              >
                Next
              </button>
            </div>

            {/* Debug 面板 */}
            <div className="absolute top-3 left-4 bg-black/40 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-3">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
                <span>debug</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} />
                <span>skeleton</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showVideo} onChange={(e) => setShowVideo(e.target.checked)} />
                <span>video</span>
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
