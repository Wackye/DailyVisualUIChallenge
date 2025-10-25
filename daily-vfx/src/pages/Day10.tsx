// src/days/day10.tsx
import React, { useEffect, useRef } from "react";

const IMAGE_URL = "./day09.jpg";
const REGL_ESM_URL = "https://cdn.jsdelivr.net/npm/regl@2.1.1/+esm";

const Day10: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      // 動態以 CDN 載入 regl（避免進 bundle）
      const createREGL: any = (await import(
        /* @vite-ignore */ REGL_ESM_URL
      )).default;

      if (cancelled) return;

      const host = hostRef.current!;
      const canvas = document.createElement("canvas");
      canvas.style.display = "block";
      host.appendChild(canvas);

      // DPR 與 resize
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = { width: 0, height: 0 };
      function resize() {
        const w = Math.max(1, host.clientWidth || 960);
        const h = Math.max(1, host.clientHeight || 540);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        size.width = canvas.width;
        size.height = canvas.height;
      }
      resize();

      // 建立 regl（不讓 pixelRatio 介入，我們自己控制 DPR）
      const regl = createREGL({
        canvas,
        attributes: { antialias: true, alpha: true, premultipliedAlpha: true },
        pixelRatio: 1,
      });

      // 互動中心（像素座標，已乘 DPR）
      const center = { x: size.width * 0.5, y: size.height * 0.5 };
      function onPointerMove(e: PointerEvent) {
        const rect = canvas.getBoundingClientRect();
        center.x = Math.max(0, Math.min(size.width, (e.clientX - rect.left) * dpr));
        center.y = Math.max(0, Math.min(size.height, (e.clientY - rect.top) * dpr));
      }
      canvas.addEventListener("pointermove", onPointerMove);

      function onResize() {
        resize();
      }
      window.addEventListener("resize", onResize);

      // 載入背景圖做紋理
      const img = new Image();
      img.src = IMAGE_URL;

      img.onload = () => {
        const texture = regl.texture({ data: img, flipY: true });

        // uniforms（大多為函數：每禎讀取最新值與尺寸）
        const uniforms = {
          uImage: texture,
          uCanvasSize: () => [size.width, size.height] as [number, number],
          uImageSize: [img.naturalWidth, img.naturalHeight] as [number, number],
          uResolution: () => [size.width, size.height] as [number, number], // canvas 像素大小（已乘 DPR）
          uCenter: () => [center.x, center.y] as [number, number],          // 互動中心（像素）
          uRadius: () => Math.min(size.width, size.height) * 0.4,           // 半徑（像素）
          uPower: 5.0,                                                      // Pinch 曲線強度
        };

        // full-screen triangle
        const positions = [-1, -1, 3, -1, -1, 3];

        const vert = `
          precision highp float;
          attribute vec2 position;
          varying vec2 vUV;
          void main(){
            vUV = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
          }
        `;

        // ===== Pinch (內凹/擠壓) 效果的 fragment shader =====
        // 在畫布 UV 空間做扭曲（含寬高比校正），再映射回圖片 UV 取樣，保留等比縮放＋置中。
        const frag = `
          precision highp float;
          varying vec2 vUV;

          uniform sampler2D uImage;
          uniform vec2  uResolution;   // canvas 像素大小（已乘 DPR）
          uniform vec2  uCanvasSize;   // 同上
          uniform vec2  uImageSize;    // 原始圖尺寸
          uniform vec2  uCenter;       // 互動中心（像素）
          uniform float uRadius;       // 半徑（像素）
          uniform float uPower;        // 扭曲曲線 power（預設 10）

          // 把「畫布 UV（0..1）」映射到圖片 UV（等比縮放＋置中）
          vec2 canvasUVToImageUV(vec2 uv) {
            float scale = min(uCanvasSize.x / uImageSize.x, uCanvasSize.y / uImageSize.y);
            vec2 sizeScaled = uImageSize * scale;
            vec2 offset = 0.5 * (uCanvasSize - sizeScaled);     // 畫布像素座標下的偏移
            vec2 p = uv * uCanvasSize;                          // 轉成畫布像素座標
            vec2 inImg = (p - offset) / sizeScaled;             // 轉成圖片 UV
            return inImg; // 取樣時再 clamp 到 [0,1]
          }

          void main(){
            // 以畫布 UV 空間進行 Pinch 扭曲
            vec2 uv = vUV;

            // 把互動中心從像素轉為畫布 UV（0..1）
            vec2 centerUV = vec2(uCenter.x / uResolution.x, 1.0 - (uCenter.y / uResolution.y));

            // 1) 校正寬高比後的座標
            vec2 aspect_uv = uv;
            aspect_uv.x *= uResolution.x / uResolution.y;

            vec2 eye_uv = centerUV;
            eye_uv.x *= uResolution.x / uResolution.y;

            // 半徑也要以高度正規化（與上面的距離同一量級）
            float radiusN = uRadius / max(uResolution.y, 1.0);

            // 2) 計算距離
            float dist = distance(eye_uv, aspect_uv);

            // 3) 計算扭曲強度（同你給的公式）
            float warp = pow(dist / max(radiusN, 1e-6), 1.0);
            float mag_factor = pow(1.0 - warp, 4.0 / max(uPower, 1e-6));

            // 4) 若在圓內，做「向外推」：uv += mag_factor * (uv - center)
            if (dist < radiusN) {
              uv += mag_factor * (centerUV - uv);
            }

            // 把扭曲後的畫布 UV 轉成圖片 UV 再取樣
            vec2 imgUV = canvasUVToImageUV(uv);
            vec3 col = texture2D(uImage, clamp(imgUV, 0.0, 1.0)).rgb;

            gl_FragColor = vec4(col, 1.0);
          }
        `;

        const draw = regl({
          vert,
          frag,
          attributes: { position: positions },
          count: 3,
          uniforms,
          viewport: () => ({ x: 0, y: 0, width: size.width, height: size.height }),
        });

        // 渲染迴圈
        const frame = regl.frame(() => {
          regl.clear({ color: [0, 0, 0, 0], depth: 1 });
          draw();
        });

        cleanup = () => {
          frame.cancel();
          try {
            (regl as any)?.destroy?.();
          } catch {}
          window.removeEventListener("resize", onResize);
          canvas.removeEventListener("pointermove", onPointerMove);
          host.removeChild(canvas);
        };
      };

      img.onerror = () => {
        console.error("[Day10] Failed to load", IMAGE_URL);
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div ref={hostRef} className="w-full aspect-[16/9] bg-gray-100" />
    </div>
  );
};

export default Day10;
