// src/days/DayXX.tsx
import { useEffect, useMemo, useRef, useState } from "react";

/** ============================================================================
 * Magnetic Cursor: Circle -> Cross (no Bezier, no libs)
 * - 平時：實心圓 (rgb(20,20,192))
 * - 吸附：切換為十字線 (rgb(5,5,128))，有漸變動畫
 * - 無外部 Library，使用 rAF 內插
 * - 兩個 demo icon，維持磁吸位移
 * ========================================================================== */

type TargetInfo = { el: HTMLElement; rect: DOMRect };

const BASE_COLOR = "rgb(20, 20, 192)";
const MAGNET_COLOR = "rgb(5, 5, 128)";

const CURSOR_RADIUS = 14;        // 圓形半徑(px)
const MAGNET_RADIUS = 120;       // 吸附半徑(px)

const CROSS_HALF_MIN = 8;        // 十字線半臂長(最小)
const CROSS_HALF_MAX = 18;       // 十字線半臂長(最大，靠近中心更長)
const CROSS_THICKNESS = 2;       // 十字線粗細(px)
const CROSS_CAP = "round";       // "butt" | "round" | "square"

const MAX_ICON_OFFSET = 16;
const STRENGTH = 8;
const POWER = 2.0;

const SMOOTHING = 0.2;           // 游標追蹤滑順
const MORPH_SPEED = 0.22;        // 圓形<->十字 漸變速度（每 frame toward 目標的比例）
const SWITCH_DAMP = 0.12;        // icon 位移平滑
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hypot = Math.hypot;

function falloff(d: number, r: number) {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return Math.pow(t, POWER);
}

export default function DayXX() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const crossHRef = useRef<SVGLineElement>(null);
  const crossVRef = useRef<SVGLineElement>(null);

  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const targets = useRef<TargetInfo[]>([]);
  const rafId = useRef<number | null>(null);

  const state = useRef({
    morph: 0,            // 0 = 圓形, 1 = 十字
    color: BASE_COLOR,   // 目前顏色
  });

  const iconStyle: React.CSSProperties = useMemo(
    () => ({
      width: 64,
      height: 64,
      borderRadius: 12,
      background: "rgba(0,0,0,0.04)",
      border: "1px solid rgba(0,0,0,0.12)",
      display: "grid",
      placeItems: "center",
      color: "#111",
      transform: "translate3d(0,0,0)",
      willChange: "transform",
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    }),
    []
  );

  // prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setIsReducedMotion(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // container size
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => setBox({ w: root.clientWidth, h: root.clientHeight }));
    ro.observe(root);
    setBox({ w: root.clientWidth, h: root.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current!;
    const svg = svgRef.current!;
    const circle = circleRef.current!;
    const h = crossHRef.current!;
    const v = crossVRef.current!;
    if (!root || !svg || !circle || !h || !v) return;

    root.style.cursor = "none";

    function collectTargets() {
      const els = root.querySelectorAll<HTMLElement>(".magnet");
      targets.current = Array.from(els).map((el) => ({
        el,
        rect: el.getBoundingClientRect(),
      }));
    }
    collectTargets();

    const roTargets = new ResizeObserver(collectTargets);
    roTargets.observe(document.body);

    const onScroll = () => collectTargets();

    const onMove = (e: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      pointer.current.tx = clamp(e.clientX - bounds.left, 0, bounds.width);
      pointer.current.ty = clamp(e.clientY - bounds.top, 0, bounds.height);
    };

    root.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", collectTargets);

    const tick = () => {
      rafId.current = requestAnimationFrame(tick);

      // 1) 平滑追蹤
      const p = pointer.current;
      const alpha = isReducedMotion ? 0.35 : SMOOTHING;
      p.x += (p.tx - p.x) * alpha;
      p.y += (p.ty - p.y) * alpha;

      const bounds = root.getBoundingClientRect();
      const gx = p.x + bounds.left;
      const gy = p.y + bounds.top;

      // 2) 找最近目標
      let nearest: TargetInfo | null = null;
      let minD = Infinity;
      for (const t of targets.current) {
        const cx = t.rect.left + t.rect.width / 2;
        const cy = t.rect.top + t.rect.height / 2;
        const d = hypot(gx - cx, gy - cy);
        if (d < minD) {
          minD = d;
          nearest = t;
        }
      }

      const tStrength = falloff(minD, MAGNET_RADIUS);
      const hasMagnet = !!nearest && tStrength > 0;

      // 3) 顏色 + 形態漸變 (0..1)
      const targetMorph = hasMagnet ? 1 : 0;
      const speed = isReducedMotion ? MORPH_SPEED * 0.6 : MORPH_SPEED;
      state.current.morph += (targetMorph - state.current.morph) * speed;
      const m = state.current.morph;

      const nextColor = hasMagnet ? MAGNET_COLOR : BASE_COLOR;
      if (nextColor !== state.current.color) {
        state.current.color = nextColor;
      }

      // 4) 更新圓形（位移 + 透明）
      circle.setAttribute("cx", String(p.x));
      circle.setAttribute("cy", String(p.y));
      circle.setAttribute("r", String(CURSOR_RADIUS));
      circle.setAttribute("fill", state.current.color);
      circle.setAttribute("opacity", String(1 - m)); // 十字顯示時，圓形淡出

      // 5) 更新十字線（中心、長度、透明）
      // 十字長度依據吸附強度 tStrength（靠近更長）
      const baseHalf = CROSS_HALF_MIN + (CROSS_HALF_MAX - CROSS_HALF_MIN) * tStrength;
      const half = baseHalf * m; // 與 morph 同步漸長
      const cx = p.x;
      const cy = p.y;

      h.setAttribute("x1", String(cx - half));
      h.setAttribute("y1", String(cy));
      h.setAttribute("x2", String(cx + half));
      h.setAttribute("y2", String(cy));

      v.setAttribute("x1", String(cx));
      v.setAttribute("y1", String(cy - half));
      v.setAttribute("x2", String(cx));
      v.setAttribute("y2", String(cy + half));

      const crossOpacity = m; // 跟著 morph 顯示
      h.setAttribute("stroke", state.current.color);
      v.setAttribute("stroke", state.current.color);
      h.setAttribute("opacity", String(crossOpacity));
      v.setAttribute("opacity", String(crossOpacity));

      // 6) icon 位移
      targets.current.forEach((t) => {
        const icx = t.rect.left + t.rect.width / 2;
        const icy = t.rect.top + t.rect.height / 2;
        const dx = gx - icx;
        const dy = gy - icy;
        const d = hypot(dx, dy);
        const f = falloff(d, MAGNET_RADIUS);
        const off = clamp(STRENGTH * f, 0, MAX_ICON_OFFSET);
        const nx = d > 0 ? dx / d : 0;
        const ny = d > 0 ? dy / d : 0;
        const tx = nx * off;
        const ty = ny * off;

        const prev = (t.el as any).__magPrev || { x: 0, y: 0 };
        const s = isReducedMotion ? 0.3 : SWITCH_DAMP;
        const sx = prev.x + (tx - prev.x) * s;
        const sy = prev.y + (ty - prev.y) * s;
        (t.el as any).__magPrev = { x: sx, y: sy };
        t.el.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      });
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      root.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", collectTargets);
      roTargets.disconnect();
      targets.current.forEach((t) => (t.el.style.transform = "translate3d(0,0,0)"));
      root.style.cursor = "";
    };
  }, [isReducedMotion, box.w, box.h]);

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
        color: "#111",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Magnetic Cursor — Circle ⇄ Cross (No-Lib)
        </h1>
        <p style={{ opacity: 0.75, marginBottom: 32 }}>
          Near icons, the cursor morphs from a circle to a crosshair with a smooth, library-free animation.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 40,
            marginTop: 60,
          }}
        >
          <button
            className="magnet"
            aria-label="Favorite"
            style={iconStyle}
            onClick={() => alert("A clicked")}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-6.716-4.632-9.428-7.344C.86 11.946.5 9.5 2.05 7.95a4.5 4.5 0 0 1 6.364 0L12 9.536l3.586-3.585a4.5 4.5 0 0 1 6.364 6.364C18.716 16.368 12 21 12 21z" />
            </svg>
          </button>

          <button
            className="magnet"
            aria-label="Settings"
            style={iconStyle}
            onClick={() => alert("B clicked")}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19.14 12.936c.04-.304.06-.616.06-.936s-.02-.632-.06-.936l2.036-1.588a.5.5 0 0 0 .12-.64l-1.93-3.344a.5.5 0 0 0-.6-.224l-2.4.96a7.95 7.95 0 0 0-1.62-.936l-.36-2.544A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.496.424l-.36 2.544c-.56.232-1.1.536-1.62.936l-2.4-.96a.5.5 0 0 0-.6.224L.794 7.012a.5.5 0 0 0 .12.64l2.036 1.588c-.04.304-.06.616-.06.936s.02.632.06.936L.914 12.7a.5.5 0 0 0-.12.64l1.93 3.344a.5.5 0 0 0 .6.224l2.4-.96c.52.4 1.06.704 1.62.936l.36 2.544A.5.5 0 0 0 10.1 23h3.8a.5.5 0 0 0 .496-.424l.36-2.544c.56-.232 1.1-.536 1.62-.936l2.4.96a.5.5 0 0 0 .6-.224l1.93-3.344a.5.5 0 0 0-.12-.64l-2.036-1.588ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* SVG overlay in container coords */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.max(1, box.w)} ${Math.max(1, box.h)}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 50,
        }}
      >
        {/* 圓形（平時顯示，吸附時淡出） */}
        <circle ref={circleRef} cx="0" cy="0" r={CURSOR_RADIUS} fill={BASE_COLOR} />

        {/* 十字線（吸附時淡入＋伸長） */}
        <line
          ref={crossHRef}
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke={MAGNET_COLOR}
          strokeWidth={CROSS_THICKNESS}
          strokeLinecap={CROSS_CAP}
          opacity="0"
        />
        <line
          ref={crossVRef}
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke={MAGNET_COLOR}
          strokeWidth={CROSS_THICKNESS}
          strokeLinecap={CROSS_CAP}
          opacity="0"
        />
      </svg>
    </div>
  );
}
