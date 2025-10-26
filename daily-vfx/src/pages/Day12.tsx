// src/days/Day12.tsx
import { useEffect, useRef } from "react";

/* ============================================================================
 * Day12 - Elastic Cursor with Snap + MotionOne + Fallback (Single-File)
 * ----------------------------------------------------------------------------
 * 功能清單：
 * 1) 慣性 + 伸縮 + 旋轉 的彈性游標效果
 * 2) 近距離吸附 snap 到選取器中心
 * 3) Motion One 驅動（載入失敗或偶發錯 → 自動切 rAF fallback）
 * 4) 動畫屬性一次性合併（避免解析競態）
 * 5) 結構化 console.log（可搜尋 scope tag）
 * 6) Demo 專用錯誤消音（index.mjs:59 相關錯誤吞掉、不洗版）
 * ==========================================================================*/

/* =========================
 *  Config（可調參數）
 * ========================= */
const CFG = {
  size: 16,               // 小圓點尺寸（px）
  accelScale: 0.012,      // 加速度→伸縮 的比例
  maxStretch: 1.9,        // 最大伸長倍率（scaleX）
  idleMs: 80,             // 停止移動多久後回正
  spring: {               // Motion One 彈簧參數
    stiffness: 180,
    damping: 22,
    mass: 0.7,
    duration: 0.35,       // 只是 fallback/guard；實際以 spring 計算
  },
  areaPreserve: true,     // true: scaleX * scaleY ≈ 1
  snapRadius: 64,         // 吸附半徑（px）
};

/* =========================
 *  Demo：錯誤消音開關
 *    - demo 展示時避免 Console 被洗版
 *    - 正式上線請改為 false 或移除
 * ========================= */
const SILENCE_DEMO_ERRORS = true;

/* =========================
 *  小工具：結構化 Logger
 *   - 每個 scope 有一致的標頭
 *   - 支援 group/time
 * ========================= */
type Logger = ReturnType<typeof mkLogger>;
function mkLogger(scope: string) {
  const tag = `[Day12:${scope}]`;
  return {
    info: (...a: any[]) => console.log(tag, ...a),
    warn: (...a: any[]) => console.warn(tag, ...a),
    error: (...a: any[]) => console.error(tag, ...a),
    dbg: (...a: any[]) => console.debug(tag, ...a),
    group: (label?: string) => console.groupCollapsed(`${tag} ${label ?? ""}`),
    groupEnd: () => console.groupEnd(),
    time: (label: string) => console.time(`${tag} ${label}`),
    timeEnd: (label: string) => console.timeEnd(`${tag} ${label}`),
  };
}
const logBoot = mkLogger("BOOT");
const logRun = mkLogger("RUN");
const logFB = mkLogger("FALLBACK");
const logDemo = mkLogger("DEMO");

/* =========================
 *  小工具
 * ========================= */
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* =========================
 *  Demo 專用：吞掉特定錯誤
 *  - 僅針對「Cannot read ... (reading '0') at index.mjs:59」類型
 * ========================= */
function installDemoErrorSilencer() {
  if (!SILENCE_DEMO_ERRORS) return () => {};
  const patterns = [
    /Cannot read (properties|property) of undefined \(reading '0'\)/i,
    /at G .*index\.mjs:59/i,
  ];

  const onError = (e: ErrorEvent) => {
    const msg = String(e.message || e.error?.message || "");
    const src = `${e.filename || ""}:${e.lineno || ""}`;
    if (patterns.some((p) => p.test(msg)) || patterns.some((p) => p.test(src))) {
      e.preventDefault();
      return true;
    }
    return undefined;
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const msg = typeof reason === "string" ? reason : reason?.message || "";
    if (patterns.some((p) => p.test(String(msg)))) {
      e.preventDefault();
    }
  };

  const origError = console.error;
  const patchedError = (...args: any[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : a?.message || "")).join(" ");
    if (patterns.some((p) => p.test(text))) return; // 靜音
    origError(...args);
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection, true);
  (console as any).error = patchedError;

  logDemo.info("Error silencer installed (demo mode).");
  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection, true);
    console.error = origError;
    logDemo.info("Error silencer removed.");
  };
}

/* ============================================================================
 *  Component
 * ==========================================================================*/
const Day12 = (props: {
  enableSnap?: boolean;
  snapSelectors?: string[];
  color?: string;
}) => {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const removeSilencer = installDemoErrorSilencer();

    let unmounted = false;
    let animate: any; // MotionOne.animate
    let spring: any;  // MotionOne.spring

    // 初始：放中間，給完整 transform（避免從 matrix 逆推）
    const el = dotRef.current!;
    el.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px) rotate(0deg) scale(1, 1)`;

    const prevCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "none";

    // run()/fallback() 的清理器
    let dispose: (() => void) | null = null;

    // 以 CDN 動態載入 Motion One
    const load = async () => {
      try {
        logBoot.group("Loading MotionOne");
        const mod = await import("https://cdn.jsdelivr.net/npm/motion@11.14.0/+esm");
        animate = mod.animate;
        spring = mod.spring;
        logBoot.info("MotionOne loaded:", { hasAnimate: !!animate, hasSpring: !!spring });
        logBoot.groupEnd();
        if (!unmounted) dispose = run();
      } catch (err) {
        logBoot.warn("MotionOne load failed. Fallback to rAF.", err);
        if (!unmounted) dispose = runFallback();
      }
    };

    /* ----------------------------------------------------------------------
     * run(): 主執行（使用 Motion One）
     *  - 多屬性合併成單一 animate 呼叫（避免 transform 解析競態）
     *  - 加入熔斷保險絲：一旦丟錯 → 立即切換 fallback
     * --------------------------------------------------------------------*/
    const run = () => {
      logRun.info("start with MotionOne");

      // === 互動狀態 ===
      let tx = innerWidth / 2, ty = innerHeight / 2; // 目標位置
      let pvx = 0, pvy = 0;                           // 上一幀速度
      let axLP = 0, ayLP = 0;                         // Acceleration LowPass
      let lastMove = performance.now();

      // 動畫控制器（單一），避免交錯
      let ctrl: any = null;

      // 熔斷保險絲：丟錯一次 → 切 fallback
      let broken = false;

      // 一幀節流：避免同幀重覆 animate
      let animRAF = 0;

      // Idle 回正計時器
      let idleTimer: number | null = null;

      // === 吸附目標查找 ===
      const getSnapTarget = () => {
        if (!props.enableSnap || !props.snapSelectors?.length) return null;
        const sels = props.snapSelectors!;
        let best: { x: number; y: number; d2: number } | null = null;
        const cx = tx, cy = ty;
        for (const sel of sels) {
          document.querySelectorAll<HTMLElement>(sel).forEach((n) => {
            const r = n.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (best === null || d2 < best.d2) best = { x, y, d2 };
          });
        }
        if (!best) return null;
        return best.d2 <= CFG.snapRadius * CFG.snapRadius ? { x: best.x, y: best.y } : null;
      };

      // === Idle 回正（只回旋轉與縮放）===
      const scheduleIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          const easing = spring(CFG.spring);
          try {
            ctrl?.cancel();
            ctrl = animate(
              el,
              { rotate: "0deg", scaleX: 1, scaleY: 1 },
              { easing, duration: CFG.spring.duration }
            );
          } catch (err) {
            logRun.warn("idle animate failed → switch to fallback", err);
            cleanup();
            dispose = runFallback();
          }
        }, CFG.idleMs);
      };

      // === 滑鼠移動處理 ===
      const onMove = (e: PointerEvent) => {
        if (broken) return; // 熔斷後不再進入 MotionOne 路徑

        const now = performance.now();
        const dt = Math.max(1, now - lastMove);

        // 速度估計（目標相對位移 / dt）
        const vx = (e.clientX - tx) / dt;
        const vy = (e.clientY - ty) / dt;

        // 加速度估計
        const ax = (vx - pvx) / dt;
        const ay = (vy - pvy) / dt;
        pvx = vx; pvy = vy;

        // 低通濾波（平滑加速度）
        axLP += (ax - axLP) * 0.18;
        ayLP += (ay - ayLP) * 0.18;

        // 更新目標位置 & 時戳
        tx = e.clientX; ty = e.clientY;
        lastMove = now;

        // 伸縮 & 旋轉角
        const mag = Math.hypot(axLP, ayLP);
        const s = clamp(1 + mag * CFG.accelScale * dt, 1, CFG.maxStretch);
        const sx = s;
        const sy = CFG.areaPreserve ? 1 / s : Math.max(1 / s, 0.4);
        const rotDeg = toDeg(Math.atan2(ayLP, axLP));
        if (!Number.isFinite(rotDeg)) return; // 防呆
        const rotateVal = `${rotDeg}deg`;

        // 吸附
        const snap = getSnapTarget();
        const toX = snap ? snap.x : tx;
        const toY = snap ? snap.y : ty;

        // 彈簧 easing
        const easing = spring(CFG.spring);

        // 同幀節流：合併一次 animate 寫入
        if (animRAF) cancelAnimationFrame(animRAF);
        animRAF = requestAnimationFrame(() => {
          try {
            ctrl?.cancel();
            ctrl = animate(
              el,
              { x: toX, y: toY, rotate: rotateVal, scaleX: sx, scaleY: sy },
              { easing, duration: CFG.spring.duration }
            );
            scheduleIdle();
          } catch (err) {
            // 熔斷：移除 listener，切 fallback（錯誤會被 demo silencer 吞掉）
            logRun.warn("animate failed → switch to fallback", err);
            broken = true;
            cleanup();
            dispose = runFallback();
          }
        });
      };

      // === 初始帶到中心點（與 transform 基值一致）===
      const initKick = () => {
        const easing0 = spring({ stiffness: 240, damping: 28, mass: 0.6 });
        try {
          ctrl?.cancel();
          ctrl = animate(
            el,
            { x: tx, y: ty, rotate: "0deg", scaleX: 1, scaleY: 1 },
            { easing: easing0, duration: 0.4 }
          );
        } catch (err) {
          logRun.warn("initial animate failed → switch to fallback", err);
          broken = true;
          cleanup();
          dispose = runFallback();
        }
      };

      // === 綁定事件 & 啟動 ===
      window.addEventListener("pointermove", onMove, { passive: true });
      initKick();

      // === 清理器 ===
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        if (animRAF) cancelAnimationFrame(animRAF);
        ctrl?.cancel();
        if (idleTimer) clearTimeout(idleTimer);
      };

      return cleanup;
    };

    /* ----------------------------------------------------------------------
     * Fallback：純 rAF（無 MotionOne）
     *  - 以 CSS transform 直接更新 translate/rotate/scale
     * --------------------------------------------------------------------*/
    const runFallback = () => {
      logFB.info("start fallback (rAF)");
      let x = innerWidth / 2, y = innerHeight / 2;
      let tx = x, ty = y;
      let pvx = 0, pvy = 0;
      let axLP = 0, ayLP = 0;
      let last = performance.now();
      let raf = 0;

      const onMove = (e: PointerEvent) => {
        tx = e.clientX; ty = e.clientY;
        last = performance.now();
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      const loop = () => {
        const now = performance.now();
        const dt = Math.max(1, now - last);

        // 慣性跟隨（簡化版）
        x += (tx - x) * 0.22;
        y += (ty - y) * 0.22;

        // 估計速度/加速度
        const vx = ((x - tx) / dt) * -0.22;
        const vy = ((y - ty) / dt) * -0.22;
        const ax = (vx - pvx) / dt;
        const ay = (vy - pvy) / dt;
        pvx = vx; pvy = vy;

        axLP += (ax - axLP) * 0.18;
        ayLP += (ay - ayLP) * 0.18;

        // 伸縮與旋轉
        const mag = Math.hypot(axLP, ayLP);
        const s = clamp(1 + mag * CFG.accelScale * dt, 1, CFG.maxStretch);
        const sx = s;
        const sy = 1 / s;
        const rotDeg = toDeg(Math.atan2(ayLP, axLP));

        // 套用 CSS transform
        if (Number.isFinite(rotDeg)) {
          el.style.transform = `translate(${x}px, ${y}px) rotate(${rotDeg}deg) scale(${sx}, ${sy})`;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      // 清理器
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
      };
    };

    // 啟動
    load();

    // 卸載清理
    return () => {
      unmounted = true;
      dispose?.();
      document.documentElement.style.cursor = prevCursor;
      removeSilencer();
    };
  }, [props.enableSnap, props.snapSelectors]);

  // 視覺節點
  return (
    <div
      ref={dotRef}
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: CFG.size,
        height: CFG.size,
        borderRadius: 9999,
        pointerEvents: "none",
        zIndex: 9999,
        background: props.color ?? "rgb(192 20 20 / 0.95)",
        willChange: "transform",
      }}
    />
  );
};

export default Day12;
