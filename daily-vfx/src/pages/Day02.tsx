// src/days/Daily01.tsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Daily01 — p5.js Demo Page
 * - 動態載入 p5（不會汙染首頁 bundle）
 * - 自適應容器大小（ResizeObserver）
 * - 離開頁面時正確釋放資源
 */

const Daily02 = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const errorRef = useRef<string>("");

  useEffect(() => {
    let cleanup = () => { };
    let resizeObserver: ResizeObserver | null = null;

    const mount = async () => {
      setStatus("loading");
      try {
        const P5 = (await import("p5")).default;

        const sketch = (s: any) => {
          let t = 0;

          const fitCanvas = () => {
            const host = hostRef.current!;
            const w = host.clientWidth || 800;
            const h = Math.round((w * 9) / 16); // 16:9 畫布
            s.resizeCanvas(w, h);
          };

          s.setup = () => {
            const host = hostRef.current!;
            const w = host.clientWidth || 800;
            const h = Math.round((w * 9) / 16);
            s.createCanvas(w, h);
          };

          s.draw = () => {
            s.background(245);
            s.noStroke();

            // 粒子式背景
            for (let i = 0; i < 160; i++) {
              const x = (i * 53.3 + t * 80) % s.width;
              const y = (i * 29.7 + t * 50) % s.height;
              s.fill(220 + (i % 20), 230, 255, 110);
              s.circle(x, y, 2 + (i % 4));
            }

            // 主視覺：彈跳圓
            const cx = s.width / 2 + 120 * Math.sin(t * 1.3);
            const cy = s.height / 2 + 60 * Math.sin(t * 0.9);
            s.fill(99, 102, 241); // indigo-500
            s.circle(cx, cy, 60 + 10 * Math.sin(t * 2));

            t += 0.01;
          };

          // 提供給外部呼叫的調整
          (s as any)._fitCanvas = fitCanvas;
        };

        // 建立實例
        p5InstanceRef.current = new P5(sketch, hostRef.current!);
        setStatus("ready");

        // 監聽容器尺寸改變，自適應
        resizeObserver = new ResizeObserver(() => {
          try {
            p5InstanceRef.current?._fitCanvas?.();
          } catch { }
        });
        resizeObserver.observe(hostRef.current!);

        cleanup = () => {
          try {
            resizeObserver?.disconnect();
          } catch { }
          try {
            p5InstanceRef.current?.remove?.();
          } catch { }
          p5InstanceRef.current = null;
        };
      } catch (err: any) {
        errorRef.current =
          (err && (err.message || String(err))) || "Unknown error";
        setStatus("error");
      }
    };

    mount();

    return () => cleanup();
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Canvas Host */}
      <div
        ref={hostRef}
      />
    </div>
  );
};

export default Daily02;
