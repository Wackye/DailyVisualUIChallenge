// src/days/Day12.tsx
import { useEffect, useRef } from "react";

/* ============================================================================
 * Day12 - Elastic Cursor with Snap + MotionOne + Fallback (Single-File)
 * + Trail Renderer (from Day13) — red 1px line, speed-based length
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
    duration: 0.35,
  },
  areaPreserve: true,
  snapRadius: 64,
};

/* Trail 相關設定（速度越快，保留點越多 → 尾巴越長） */
const TRAIL = {
  BASE_LEN: 16,
  MAX_LEN: 220,
  SPEED_TO_LEN: 0.06, // 速度倍率
  LINE_WIDTH: 2,
  COLOR: "rgba(20 20 192)",
};

const SILENCE_DEMO_ERRORS = true;

/* =========================
 *  小工具：結構化 Logger
 * ========================= */
type Logger = ReturnType<typeof mkLogger>;
function mkLogger(scope: string) {
  const tag = `[Day12:${scope}]`;
  return {
    info: (...a: any[]) => console.log(tag, ...a),
    warn: (...a: any[]) => console.warn(tag, ...a),
    error: (...a: any[]) => console.error(tag, ...a),
    dbg:  (...a: any[]) => console.debug(tag, ...a),
    group: (label?: string) => console.groupCollapsed(`${tag} ${label ?? ""}`),
    groupEnd: () => console.groupEnd(),
    time: (label: string) => console.time(`${tag} ${label}`),
    timeEnd: (label: string) => console.timeEnd(`${tag} ${label}`),
  };
}
const logBoot: Logger = mkLogger("BOOT");
const logRun: Logger  = mkLogger("RUN");
const logFB: Logger   = mkLogger("FALLBACK");
const logDemo: Logger = mkLogger("DEMO");

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* Demo 專用：吞掉特定錯誤 */
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
    if (patterns.some((p) => p.test(String(msg)))) e.preventDefault();
  };
  const origError = console.error;
  const patchedError = (...args: any[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : a?.message || "")).join(" ");
    if (patterns.some((p) => p.test(text))) return;
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

    // === 建立 Trail Canvas（固定全螢幕，位於 dot 下層） ===
    const trailCanvas = document.createElement("canvas");
    const trailCtx = trailCanvas.getContext("2d")!;
    Object.assign(trailCanvas.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "9998",           // dot 的 zIndex 是 9999
      pointerEvents: "none",
    } as CSSStyleDeclaration);
    document.body.appendChild(trailCanvas);

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    const resizeTrail = () => {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.floor(innerWidth * dpr);
      const h = Math.floor(innerHeight * dpr);
      trailCanvas.width = w;
      trailCanvas.height = h;
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.clearRect(0, 0, innerWidth, innerHeight);
    };
    resizeTrail();
    const ro = new ResizeObserver(resizeTrail);
    ro.observe(document.documentElement);

    // === Trail 狀態 ===
    const points: Array<{ x: number; y: number; t: number }> = [];
    let currentSpeed = 0;
    let lastSampleX = innerWidth / 2;
    let lastSampleY = innerHeight / 2;
    let lastSampleT = performance.now();

    // === 以 dot 的實際畫面位置（中心點）來取樣 ===
    const sampleDotCenter = () => {
      const el = dotRef.current!;
      const r = el.getBoundingClientRect();
      // dot 已含 translate/scale/rotate，取視覺中心
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return { x: cx, y: cy };
    };

    // === Trail 畫圖迴圈 ===
    let rafTrail = 0;
    const loopTrail = () => {
      rafTrail = requestAnimationFrame(loopTrail);

      // 取樣位置
      const now = performance.now();
      const { x, y } = sampleDotCenter();

      // 估速（px/sec）
      const dt = Math.max(1, now - lastSampleT);
      const dist = Math.hypot(x - lastSampleX, y - lastSampleY);
      currentSpeed = (dist / dt) * 1000;
      lastSampleX = x; lastSampleY = y; lastSampleT = now;

      // 推入點
      points.push({ x, y, t: now });

      // 長度依速度調整
      const dynamicLen = Math.min(
        TRAIL.MAX_LEN,
        Math.floor(TRAIL.BASE_LEN + currentSpeed * TRAIL.SPEED_TO_LEN)
      );
      if (points.length > dynamicLen) {
        points.splice(0, points.length - dynamicLen);
      }

      // 繪製
      trailCtx.clearRect(0, 0, innerWidth, innerHeight);
      if (points.length > 1) {
        trailCtx.beginPath();
        trailCtx.lineWidth = TRAIL.LINE_WIDTH;
        trailCtx.strokeStyle = TRAIL.COLOR;
        trailCtx.lineJoin = "round";
        trailCtx.lineCap = "round";
        trailCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          trailCtx.lineTo(points[i].x, points[i].y);
        }
        trailCtx.stroke();
      }
    };
    loopTrail();

    // === Day12 原本邏輯 ===
    // 初始：放中間，給完整 transform（避免從 matrix 逆推）
    const el = dotRef.current!;
    el.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px) rotate(0deg) scale(1, 1)`;

    const prevCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "none";

    let dispose: (() => void) | null = null;

    const load = async () => {
      try {
        logBoot.group("Loading MotionOne");
        const mod = await import("https://cdn.jsdelivr.net/npm/motion@11.14.0/+esm");
        animate = mod.animate;
        spring  = mod.spring;
        logBoot.info("MotionOne loaded:", { hasAnimate: !!animate, hasSpring: !!spring });
        logBoot.groupEnd();
        if (!unmounted) dispose = run();
      } catch (err) {
        logBoot.warn("MotionOne load failed. Fallback to rAF.", err);
        if (!unmounted) dispose = runFallback();
      }
    };

    const run = () => {
      logRun.info("start with MotionOne");

      let tx = innerWidth / 2, ty = innerHeight / 2;
      let pvx = 0, pvy = 0;
      let axLP = 0, ayLP = 0;
      let lastMove = performance.now();

      let ctrl: any = null;
      let broken = false;
      let animRAF = 0;
      let idleTimer: number | null = null;

      const getSnapTarget = (): { x: number; y: number } | null => {
        if (!props.enableSnap || !props.snapSelectors?.length) return null;
        const sels = props.snapSelectors!;
        let bestX = 0;
        let bestY = 0;
        let hasBest = false;
        let bestDistanceSq = Number.POSITIVE_INFINITY;
        const cx = tx, cy = ty;
        for (const sel of sels) {
          document.querySelectorAll<HTMLElement>(sel).forEach((n) => {
            const r = n.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (d2 < bestDistanceSq) {
              bestDistanceSq = d2;
              bestX = x;
              bestY = y;
              hasBest = true;
            }
          });
        }
        if (!hasBest) return null;
        if (bestDistanceSq <= CFG.snapRadius * CFG.snapRadius) {
          return { x: bestX, y: bestY };
        }
        return null;
      };

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

      const onMove = (e: PointerEvent) => {
        if (broken) return;
        const now = performance.now();
        const dt = Math.max(1, now - lastMove);

        const vx = (e.clientX - tx) / dt;
        const vy = (e.clientY - ty) / dt;

        const ax = (vx - pvx) / dt;
        const ay = (vy - pvy) / dt;
        pvx = vx; pvy = vy;

        axLP += (ax - axLP) * 0.18;
        ayLP += (ay - ayLP) * 0.18;

        tx = e.clientX; ty = e.clientY;
        lastMove = now;

        const mag = Math.hypot(axLP, ayLP);
        const s = clamp(1 + mag * CFG.accelScale * dt, 1, CFG.maxStretch);
        const sx = s;
        const sy = CFG.areaPreserve ? 1 / s : Math.max(1 / s, 0.4);
        const rotDeg = toDeg(Math.atan2(ayLP, axLP));
        if (!Number.isFinite(rotDeg)) return;
        const rotateVal = `${rotDeg}deg`;

        const snap = getSnapTarget();
        const toX = snap ? snap.x : tx;
        const toY = snap ? snap.y : ty;

        const easing = spring(CFG.spring);

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
            logRun.warn("animate failed → switch to fallback", err);
            broken = true;
            cleanup();
            dispose = runFallback();
          }
        });
      };

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
          cleanup();
          dispose = runFallback();
        }
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      initKick();

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        if (animRAF) cancelAnimationFrame(animRAF);
        ctrl?.cancel();
        if (idleTimer) clearTimeout(idleTimer);
      };
      return cleanup;
    };

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

        x += (tx - x) * 0.22;
        y += (ty - y) * 0.22;

        const vx = ((x - tx) / dt) * -0.22;
        const vy = ((y - ty) / dt) * -0.22;
        const ax = (vx - pvx) / dt;
        const ay = (vy - pvy) / dt;
        pvx = vx; pvy = vy;

        axLP += (ax - axLP) * 0.18;
        ayLP += (ay - ayLP) * 0.18;

        const mag = Math.hypot(axLP, ayLP);
        const s = clamp(1 + mag * CFG.accelScale * dt, 1, CFG.maxStretch);
        const sx = s;
        const sy = 1 / s;
        const rotDeg = toDeg(Math.atan2(ayLP, axLP));

        if (Number.isFinite(rotDeg)) {
          dotRef.current!.style.transform =
            `translate(${x}px, ${y}px) rotate(${rotDeg}deg) scale(${sx}, ${sy})`;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
      };
    };

    // 啟動 Day12 流程
    load();

    // 卸載清理（包含 Trail）
    return () => {
      unmounted = true;
      document.documentElement.style.cursor = prevCursor;
      removeSilencer();
      ro.disconnect();
      cancelAnimationFrame(rafTrail);
      document.body.removeChild(trailCanvas);
      dispose?.();
    };
  }, [props.enableSnap, props.snapSelectors]);

  // 視覺節點（Day12 原樣）
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
        zIndex: 9999, // 高於 Trail Canvas
        background: props.color ?? "rgb(20 20 192 / 0.95)",
        willChange: "transform",
      }}
    />
  );
};

export default Day12;
