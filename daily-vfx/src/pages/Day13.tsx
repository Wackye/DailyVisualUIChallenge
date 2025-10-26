// src/days/Day13.tsx
import { useEffect, useRef } from "react";

/**
 * Day13 - Cursor Trail with Motion.js (Motion One)
 * 規格：
 * 1) 尾巴粗細 1px
 * 2) 尾巴紅色
 * 3) 依游標速度自動調整軌跡長度（越快越長）
 * 4) 使用 CDN ESM 動態載入 Motion One，避免專案體積成長
 */
const Day13 = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    // 用 CSS 變數承接 Motion 的補間結果
    canvas.style.setProperty("--x", "0");
    canvas.style.setProperty("--y", "0");
    host.appendChild(canvas);

    const ctx = canvas.getContext("2d")!;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    // 追蹤點列（最新在尾端）
    const points: Array<{ x: number; y: number }> = [];
    // 用來估算當前速度（像素/秒）
    let currentSpeed = 0;
    let lastEventX = 0;
    let lastEventY = 0;
    let lastEventT = performance.now();

    // Trail 長度設定（會依速度自動調整）
    const BASE_LEN = 16;         // 最短保底節點數
    const MAX_LEN = 100;         // 上限節點數
    const SPEED_TO_LEN = 0.06;   // 速度轉換為額外節點的倍率（可微調）

    // Motion One 控制
    let motionReady = false as boolean;
    let animate: any = null;
    let spring: any = null;
    let activeAnim: any = null;

    // 取得補間結果（從 CSS 變數讀）
    const getAnimatedPos = () => {
      const cs = getComputedStyle(canvas);
      const x = parseFloat(cs.getPropertyValue("--x")) || lastEventX;
      const y = parseFloat(cs.getPropertyValue("--y")) || lastEventY;
      return { x, y };
    };

    // Resize & DPR
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 重新繪製背景
      ctx.clearRect(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // 主要繪圖：每一幀依據 Motion 的補間位置推進 points
    let rafId = 0;
    const loop = () => {
      rafId = requestAnimationFrame(loop);

      // 讀取 Motion 的補間結果
      const { x, y } = getAnimatedPos();
      points.push({ x, y });

      // 依速度調整可保留節點數
      const dynamicLen = Math.min(
        MAX_LEN,
        Math.floor(BASE_LEN + currentSpeed * SPEED_TO_LEN)
      );
      // 保持 points 長度在 dynamicLen
      if (points.length > dynamicLen) {
        points.splice(0, points.length - dynamicLen);
      }

      // 清畫布 & 繪製尾跡
      const rect = host.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (points.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 1;             // 1px 尾巴
        ctx.strokeStyle = "red";       // 紅色
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // 依據點的先後加一點 alpha 漸層（可讀性更好）
        // 先繪一次整段紅線
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // 也可選擇加上淡化：分段繪製（較耗效能），預設先不做
      }
    };

    // 指標事件
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 速度估算
      const now = performance.now();
      const dt = Math.max(1, now - lastEventT); // ms
      const dx = x - lastEventX;
      const dy = y - lastEventY;
      const dist = Math.hypot(dx, dy);
      // 像素/秒
      currentSpeed = (dist / dt) * 1000;

      lastEventX = x;
      lastEventY = y;
      lastEventT = now;

      // 使用 Motion 的 spring 對 CSS 變數 --x, --y 做補間
      if (motionReady) {
        // 若有舊動畫先停止（避免堆疊）
        if (activeAnim && typeof activeAnim.cancel === "function") {
          activeAnim.cancel();
        }

        // 速度越快可降低阻尼或提高剛性，讓尾跡更「跟不太上」而拉長
        // 這裡用簡單映射：速度高 -> damping 低
        const damping = Math.max(20, 50 - Math.min(40, currentSpeed * 0.02));
        const stiffness = Math.min(800, 400 + currentSpeed * 0.6);

        activeAnim = animate(
          canvas,
          {
            // 直接把數值寫入 CSS 變數
            ["--x" as any]: x,
            ["--y" as any]: y,
          },
          {
            duration: 1.2, // 讓 spring 有時間發揮（實際由 spring 接管）
            easing: spring({ stiffness, damping }),
          }
        );
      } else {
        // 若 Motion 尚未就緒，先直接推點，避免一開始無感
        points.push({ x, y });
      }
    };

    const onEnter = (e: PointerEvent) => {
      // 初始錨點
      const rect = host.getBoundingClientRect();
      lastEventX = e.clientX - rect.left;
      lastEventY = e.clientY - rect.top;
      lastEventT = performance.now();
      canvas.style.setProperty("--x", `${lastEventX}`);
      canvas.style.setProperty("--y", `${lastEventY}`);
      // 清空既有點
      points.length = 0;
    };

    const onLeave = () => {
      // pointer 離開時不再新增點，但保留現有尾跡自動消退
      // 這裡不清空 points，讓它自然被 dynamicLen 截斷
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);

    // 啟動繪圖循環
    loop();

    // 動態載入 Motion One（Motion.js）
    (async () => {
      try {
        const mod = await import("https://cdn.jsdelivr.net/npm/motion@10.18.0/+esm");
        animate = mod.animate;
        spring = mod.spring;
        motionReady = true;
      } catch (err) {
        console.error("[Day13] Failed to load Motion.js via CDN:", err);
        motionReady = false;
      }
    })();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      if (activeAnim && typeof activeAnim.cancel === "function") {
        activeAnim.cancel();
      }
      host.removeChild(canvas);
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div
        ref={hostRef}
        className="w-full aspect-[16/9] bg-white relative overflow-hidden"
      />
    </div>
  );
};

export default Day13;
