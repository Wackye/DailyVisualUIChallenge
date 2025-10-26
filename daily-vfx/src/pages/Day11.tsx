// src/days/day11.tsx
import React, { useEffect, useRef } from "react";

/* ---------------------------------
 *  全域宣告（GSAP 走 CDN）
 * --------------------------------- */
declare global {
  interface Window {
    gsap?: any;
  }
}

/* ---------------------------------
 *  工具：載入 CDN Script / 只注入一次樣式
 * --------------------------------- */
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

function ensureStyleOnce(id: string, css: string) {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
  return () => {
    const el = document.getElementById(id);
    if (el) el.remove();
  };
}

/* ---------------------------------
 *  這份檔案唯一的 CSS（集中管理）
 *  使用 .day11-* 前綴，避免影響到其他頁
 * --------------------------------- */
const DAY11_CSS = `
.day11-scope { position: relative; }

/* 自訂游標 */
.day11-cursor {
  position: fixed; left: 0; top: 0;
  width: 24px; height: 24px; background: #0a0a0a; border-radius: 50%;
  pointer-events: none; z-index: 99999; transform: translate(-50%, -50%);
  will-change: transform, width, height, border-radius, opacity;
}

/* 全螢幕 SVG overlay */
.day11-overlay {
  position: fixed; left: 0; top: 0; pointer-events: none; z-index: 99997;
  contain: layout paint size style;
}

/* L 角群組（不要在 CSS 強制黑色）*/
.day11-lshape { will-change: transform, filter, opacity; transform-box: fill-box; transform-origin: 0 0; }
.day11-lshape line {
  stroke: var(--day11-lshape-stroke, #D24C4C);
  stroke-width: 2; stroke-linecap: butt;
  vector-effect: non-scaling-stroke; shape-rendering: crispEdges;
}

/* 矩形 mask */
.day11-rect {
  fill: rgba(210,76,76,0.10);
  stroke: rgba(192,192,192,0.0);
  stroke-width: 2;
  vector-effect: non-scaling-stroke; shape-rendering: crispEdges;
  will-change: opacity;
}

/* 文章容器（不強制黑字，交給 Tailwind 控色） */
.day11-article { min-height: 40vh; }
`;

/* ---------------------------------
 *  Day11 Component（單檔：邏輯 + CSS）
 * --------------------------------- */
const Day11: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  // 游標 / 作用區塊 / 進場鎖
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const activeBlockRef = useRef<HTMLElement | null>(null);
  const enterLockRef = useRef(false);

  // 清理器們
  const disposeFns = useRef<Array<() => void>>([]);

  useEffect(() => {
    // 1) 注入集中樣式
    const removeStyle = ensureStyleOnce("day11-style", DAY11_CSS);
    disposeFns.current.push(removeStyle);

    let isCancelled = false;

    // 2) 啟動互動
    (async () => {
      await loadScript("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js");
      if (isCancelled) return;
      const gsap = window.gsap!;
      const host = hostRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const snap = (v: number) => Math.round(v * dpr) / dpr;

      /* ---------- Cursor ---------- */
      const cursor = document.createElement("div");
      cursor.className = "day11-cursor";
      document.body.appendChild(cursor);
      cursorRef.current = cursor;

      gsap.set(cursor, { xPercent: -50, yPercent: -50 });
      const onPointerMove = (e: PointerEvent) => gsap.set(cursor, { x: e.clientX, y: e.clientY });
      document.addEventListener("pointermove", onPointerMove);
      disposeFns.current.push(() => document.removeEventListener("pointermove", onPointerMove));

      // host 用自訂游標
      host.style.cursor = "none";

      /* ---------- SVG Overlay 工具 ---------- */
      const createOverlay = () => {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        svg.classList.add("day11-overlay");
        svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
        svg.setAttribute("width", String(vw));
        svg.setAttribute("height", String(vh));
        (svg.style as any).width = `${vw}px`;
        (svg.style as any).height = `${vh}px`;
        (svg.style as any).transform = "translateZ(0)";
        document.body.appendChild(svg);
        return svg;
      };

      const updateOverlayViewport = (svg: SVGSVGElement) => {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
        svg.setAttribute("width", String(vw));
        svg.setAttribute("height", String(vh));
        (svg.style as any).width = `${vw}px`;
        (svg.style as any).height = `${vh}px`;
      };

      /* ---------- L 角 ---------- */
      const createLGroup = (len = 14, strokeWidth = 2) => {
        const NS = "http://www.w3.org/2000/svg";
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "day11-lshape");

        const mkLine = () => document.createElementNS(NS, "line");

        const h = mkLine();
        h.setAttribute("x1", "0"); h.setAttribute("y1", "0");
        h.setAttribute("x2", String(len)); h.setAttribute("y2", "0");
        h.setAttribute("stroke-width", String(strokeWidth));
        h.setAttribute("stroke-linecap", "butt");
        h.setAttribute("vector-effect", "non-scaling-stroke");
        h.setAttribute("shape-rendering", "crispEdges");

        const v = mkLine();
        v.setAttribute("x1", "0"); v.setAttribute("y1", "0");
        v.setAttribute("x2", "0"); v.setAttribute("y2", String(len));
        v.setAttribute("stroke-width", String(strokeWidth));
        v.setAttribute("stroke-linecap", "butt");
        v.setAttribute("vector-effect", "non-scaling-stroke");
        v.setAttribute("shape-rendering", "crispEdges");

        g.append(h, v);
        (g.style as any).transformOrigin = "0 0";
        (g.style as any).transformBox = "fill-box";
        return g as SVGGElement;
      };

      /* ---------- 每個 block 的狀態 ---------- */
      type BlockState = {
        svg?: SVGSVGElement;
        groups?: SVGGElement[];
        rect?: SVGRectElement;
        detachSync?: () => void;
        enterTl?: any; // gsap.core.Timeline
        leaveTl?: any; // gsap.core.Timeline
      };
      const perBlock = new WeakMap<HTMLElement, BlockState>();

      const forceClearActive = (killAnimations = true) => {
        const prev = activeBlockRef.current;
        if (!prev) return;
        const st = perBlock.get(prev);
        if (st) {
          if (killAnimations) {
            st.enterTl?.kill?.();
            st.leaveTl?.kill?.();
          }
          st.detachSync?.();
          st.svg?.remove();
          perBlock.delete(prev);
        }
        activeBlockRef.current = null;
        enterLockRef.current = false;
      };

      const attachSync = (block: HTMLElement, state: BlockState) => {
        let raf = 0;
        const sync = () => {
          raf = 0;
          if (!state.svg || !state.groups) return;
          updateOverlayViewport(state.svg);
          const rc = block.getBoundingClientRect();
          const corners = [
            { x: snap(rc.left),  y: snap(rc.top),    sx:  1, sy:  1 },
            { x: snap(rc.right), y: snap(rc.top),    sx: -1, sy:  1 },
            { x: snap(rc.right), y: snap(rc.bottom), sx: -1, sy: -1 },
            { x: snap(rc.left),  y: snap(rc.bottom), sy: -1, sx:  1 },
          ];
          // 修正 corners 第 4 點 sx/sy 順序（避免手誤）
          corners[3] = { x: snap(rc.left), y: snap(rc.bottom), sx: 1, sy: -1 };

          corners.forEach((c, i) => {
            gsap.set(state.groups![i], {
              x: c.x, y: c.y, scaleX: c.sx, scaleY: c.sy, overwrite: true,
            });
          });

          if (state.rect) {
            state.rect.setAttribute("x", String(snap(rc.left)));
            state.rect.setAttribute("y", String(snap(rc.top)));
            state.rect.setAttribute("width", String(snap(rc.width)));
            state.rect.setAttribute("height", String(snap(rc.height)));
          }
        };
        const req = () => { if (!raf) raf = requestAnimationFrame(sync); };
        window.addEventListener("scroll", req, { passive: true });
        window.addEventListener("resize", req);
        sync();
        state.detachSync = () => {
          window.removeEventListener("scroll", req);
          window.removeEventListener("resize", req);
          if (raf) cancelAnimationFrame(raf);
        };
      };

      /* ---------- Enter / Leave ---------- */
      const onBlockEnter = (block: HTMLElement) => (e: PointerEvent) => {
        // 若上一個 active 還在，先清
        if (activeBlockRef.current && activeBlockRef.current !== block) {
          forceClearActive(true);
        }
        // 進場上鎖
        if (enterLockRef.current) return;
        enterLockRef.current = true;
        activeBlockRef.current = block;

        const rc = block.getBoundingClientRect();
        const crossPoint = { x: e.clientX, y: e.clientY };

        // 游標：圓 → 正方形 16×16
        gsap.to(cursorRef.current!, {
          width: 16, height: 16, borderRadius: 0, duration: 0.2, ease: "power2.out",
        });

        // 準備 SVG + mask + 四個角標
        const svg = createOverlay();
        const NS = "http://www.w3.org/2000/svg";

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("class", "day11-rect");
        svg.appendChild(rect);

        const startSize = 16;
        rect.setAttribute("x", String(snap(crossPoint.x - startSize / 2)));
        rect.setAttribute("y", String(snap(crossPoint.y - startSize / 2)));
        rect.setAttribute("width", String(startSize));
        rect.setAttribute("height", String(startSize));
        rect.setAttribute("opacity", "1");
        rect.setAttribute("filter",String("blur(0px)"));

        const groups: SVGGElement[] = [createLGroup(), createLGroup(), createLGroup(), createLGroup()];
        groups.forEach((g) => svg.appendChild(g));

        const corners = [
          { x: snap(rc.left),  y: snap(rc.top),    sx:  1, sy:  1 },
          { x: snap(rc.right), y: snap(rc.top),    sx: -1, sy:  1 },
          { x: snap(rc.right), y: snap(rc.bottom), sx: -1, sy: -1 },
          { x: snap(rc.left),  y: snap(rc.bottom), sx:  1, sy: -1 },
        ];

        // 初始狀態：從滑鼠點開始
        groups.forEach((g) => {
          (g.style as any).transformOrigin = "0 0";
          (g.style as any).transformBox = "fill-box";
          gsap.set(g, {
            x: snap(crossPoint.x),
            y: snap(crossPoint.y),
            scaleX: 0,
            scaleY: 0,
            opacity: 0,
            filter: "blur(8px)",
            rotation: -180,
          });
        });

        // 存入狀態
        const state0 = perBlock.get(block) ?? {};
        const baseState: BlockState = { ...state0, svg, groups, rect };
        perBlock.set(block, baseState);

        const tl = gsap.timeline({
          defaults: { duration: 0.4, ease: "power2.out" },
          onComplete: () => {
            // 入場成功 → 啟用同步、更新狀態、解鎖
            const stDone: BlockState = { ...perBlock.get(block), svg, groups, rect, enterTl: undefined };
            attachSync(block, stDone);
            perBlock.set(block, stDone);
            enterLockRef.current = false;
          },
        });

        // 讓 Leave 可偵測/kill 進場
        perBlock.set(block, { ...baseState, enterTl: tl });

        // Enter 被 kill → 中斷清理 + 游標還原
        tl.eventCallback("onInterrupt", () => {
          const st = perBlock.get(block);
          st?.detachSync?.();
          st?.svg?.remove();
          perBlock.delete(block);
          if (activeBlockRef.current === block) activeBlockRef.current = null;
          enterLockRef.current = false;
          gsap.to(cursorRef.current!, {
            width: 24, height: 24, borderRadius: "50%", duration: 0.18, ease: "power2.out",
          });
        });

        // L 角位移到四角
        groups.forEach((g, i) => {
          tl.to(
            g,
            {
              x: corners[i].x,
              y: corners[i].y,
              scaleX: corners[i].sx,
              scaleY: corners[i].sy,
              opacity: 1,
              filter: "blur(0px)",
              rotation: 0,
            },
            0
          );
        });

        // mask 撐到區塊，淡出後移除
        tl.to(
          rect,
          {
            attr: {
              x: corners[0].x, y: corners[0].y,
              width: snap(rc.width), height: snap(rc.height),
              
            },
//            filter:"blur(5px)",
            opacity: 0,
          },
          0
        ).to(
          rect,
          { opacity: 0, duration: 0.2, ease: "power1.out", onComplete: () => rect.remove() },
          ">-0.05"
        );
      };

      const onBlockLeave = (block: HTMLElement) => (e: PointerEvent) => {
        const st = perBlock.get(block);

        // 若進場仍在跑 → 直接 kill（觸發 onInterrupt 完整清理）
        if (st?.enterTl && st.enterTl.isActive?.()) {
          st.enterTl.kill();
          return;
        }

        if (activeBlockRef.current === block) activeBlockRef.current = null;

        // 正常離場：回收到滑鼠位置
        const crossPoint = { x: e.clientX, y: e.clientY };
        const targetX = snap(crossPoint.x);
        const targetY = snap(crossPoint.y);

        if (st?.groups && st.svg) {
          const lt = gsap.timeline({
            defaults: { duration: 0.3, ease: "power2.inOut" },
            onComplete: () => {
              st.detachSync?.();
              st.svg?.remove();
              perBlock.delete(block);
            },
          });

          st.leaveTl = lt;
          perBlock.set(block, st);

          st.groups.forEach((g) => {
            lt.to(g, { x: targetX, y: targetY, filter: "blur(8px)", opacity: 0 }, 0);
          });
        }

        // 游標回圓形 24×24
        gsap.to(cursorRef.current!, {
          width: 24, height: 24, borderRadius: "50%", duration: 0.18, ease: "power2.out",
        });
      };

      // 綁定所有 text-block
      const blocks = host.querySelectorAll<HTMLElement>(".text-block");
      blocks.forEach((b, i) => {
        const enter = onBlockEnter(b);
        const leave = onBlockLeave(b);
        b.addEventListener("pointerenter", enter);
        b.addEventListener("pointerleave", leave);
        disposeFns.current.push(() => {
          b.removeEventListener("pointerenter", enter);
          b.removeEventListener("pointerleave", leave);
        });
        // console.log(`[Bind] block[${i}] bound`);
      });
    })();

    // 3) 清理
    return () => {
      isCancelled = true;
      disposeFns.current.forEach((fn) => fn());
      disposeFns.current = [];
      cursorRef.current?.remove();
    };
  }, []);

  /* ---------------------------------
   *  Demo 內容（交給 Tailwind 控色）
   *  想改 L 角顏色：在最外層覆寫 CSS 變數
   *  如：style={{ ["--day11-lshape-stroke" as any]: "#6b7280" }} // gray-500
   * --------------------------------- */
  return (
    <div
      className="w-full max-w-7xl mx-auto day11-scope"
      // style={{ ["--day11-lshape-stroke" as any]: "#6b7280" }}
    >
      <main
        ref={hostRef}
        className="w-full aspect-[16/9] relative overflow-auto select-none"
      >
        <article className="day11-article px-10 md:px-14 py-10 md:py-14 prose prose-neutral max-w-none">
          <h2 className="text-block p-2 font-sans text-gray-800 text-2xl md:text-3xl font-semibold tracking-tight mb-3">
            Cursor as Narrative: Micro-Interactions for Spatial Attention
          </h2>

          <p className="text-block p-2 font-serif text-gray-600 leading-[1.95] not-prose mb-6">
            We frame cursor morphology as a temporal composition. Upon entry, the pointer
            stabilizes into a rigid 16×16 square while a mask expands from the locus
            of approach, indexing spatial scope before fading to reduce residual load.
          </p>

          <h3 className="text-block p-2 font-sans not-prose text-xl md:text-2xl font-semibold tracking-tight mt-10 mb-2 text-gray-800">
            Method: Timeline Orchestration &amp; Viewport Synchronization
          </h3>

          <p className="text-block p-2 font-serif leading-[1.95] not-prose text-gray-600 mb-4">
            We orchestrate concurrent cues: cursor morph, mask expansion, and corner
            markers dissolving from blur. After entrance, lightweight synchronization
            adheres markers to the element’s <span className="font-sans">DOMRect</span>
            during scroll and resize, preserving a one-to-one mapping to screen pixels.
          </p>

          <p className="text-block p-2 font-serif leading-[1.95] not-prose text-gray-600">
            The design objective is <span className="font-sans">legibility</span>:
            motion communicates scope and intent while minimizing cognitive overhead,
            enabling readers to parse structure sentence by sentence.
          </p>
        </article>
      </main>
    </div>
  );
};

export default Day11;
