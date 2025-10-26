// src/day09.tsx
import { useEffect, useRef, useState } from 'react';

// DEBUG 前綴，方便過濾
const LOG_PREFIX = "[Day09 Debug]";

// 模組級狀態變數，在組件卸載時重置
let particles: any[] = [];
let imgBitmap: ImageBitmap | null = null;
let raf = 0; 
let t0 = 0; 
let last = 0; 
let running = false;


export default function Day09() {
  console.log(`${LOG_PREFIX} Component Rendered. (t0=${t0}, running=${running})`);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  // [FIX] 針對新需求的參數調整
  const src = '/day09.jpg';
  const sampleStep = 3;
  const particleSize = 3;         
  
  // 1. 動畫總時長：10秒鐘從下到上崩解 + 5秒鐘粒子下落/淡出
  const STAGGER_DURATION = 5000; // 10秒內從下到上崩解 (ms)
  const PARTICLE_LIFESPAN = 3000; // 粒子啟動後的生命週期 (ms)
  
  // 2. 不同的掉落速度 (隨機重力)
  const BASE_GRAVITY = 300;       // 基礎重力
  const GRAVITY_RANGE = 2000;      // 重力隨機範圍
  
  // 3. 落葉效果參數 (保持)
  const INITIAL_RANDOM_SPEED_X = 50; // 初始水平隨機速度
  const INITIAL_RANDOM_SPEED_Y = -200; // 初始垂直隨機速度 (輕微向上)
  const FRICTION = 0.95;           // 空氣阻力係數
  const TURBULENCE_STRENGTH = 500; // [新] 左右擾動的強度 (px/s^2)

  function easeInCubic(t: number) { 
    return t * t * t; 
  }

  /**
   * 1. 處理畫布 RWD 與 高 DPI
   */
  function resize() {
    console.log(`${LOG_PREFIX} resize(): Triggered.`);
    if (!hostRef.current || !canvasRef.current) {
      console.warn(`${LOG_PREFIX} resize(): Aborted (refs not ready).`);
      return;
    }
    const cvs = canvasRef.current;
    const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = hostRef.current.getBoundingClientRect();
    console.log(`${LOG_PREFIX} resize(): Host rect: ${rect.width}x${rect.height}, Ratio: ${ratio}`);
    cvs.width = Math.floor(rect.width * ratio);
    cvs.height = Math.floor(rect.height * ratio);
    cvs.style.width = rect.width + 'px';
    cvs.style.height = rect.height + 'px';
    const ctx = cvs.getContext('2d');
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    console.log(`${LOG_PREFIX} resize(): Canvas set to: ${cvs.width}x${cvs.height}`);
  }

  /**
   * 2. 準備階段：載入圖片、離屏抽樣
   */
  async function prepare() {
    console.group(`${LOG_PREFIX} prepare(): Starting...`);
    if (!hostRef.current) {
      console.warn(`${LOG_PREFIX} prepare(): Aborted (hostRef not ready).`);
      console.groupEnd();
      return false;
    }

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      console.log(`${LOG_PREFIX} prepare(): Image fetched (status ${response.status}).`);
      
      const img = await createImageBitmap(await response.blob());
      imgBitmap = img;
      console.log(`${LOG_PREFIX} prepare(): ImageBitmap created (${img.width}x${img.height}).`);

      const offscreen = document.createElement('canvas');
      const ctx2 = offscreen.getContext('2d');
      if (!ctx2) throw new Error("Failed to get offscreen 2D context.");

      const hostRect = hostRef.current.getBoundingClientRect();
      console.log(`${LOG_PREFIX} prepare(): Host rect: ${hostRect.width}x${hostRect.height}`);

      const scale = Math.min(hostRect.width / img.width, hostRect.height / img.height);
      const dw = Math.floor(img.width * scale);
      const dh = Math.floor(img.height * scale);
      offscreen.width = dw; 
      offscreen.height = dh;
      console.log(`${LOG_PREFIX} prepare(): Calculated scale: ${scale}, Target size: ${dw}x${dh}`);

      if (dw === 0 || dh === 0) throw new Error(`Calculated dimensions are zero.`);

      ctx2.drawImage(img, 0, 0, dw, dh);
      
      const id = ctx2.getImageData(0, 0, dw, dh);
      console.log(`${LOG_PREFIX} prepare(): Offscreen image data sampled.`);
      
      particles = [];
      const imageTopY = (hostRect.height - dh) / 2; // 圖片在畫布上的頂部 Y 座標
      
      for (let y = 0; y < dh; y += sampleStep) {
        for (let x = 0; x < dw; x += sampleStep) {
          const i = (y * dw + x) * 4;
          const a = id.data[i + 3];
          if (a > 32) {
            const r = id.data[i + 0], g = id.data[i + 1], b = id.data[i + 2];
            const color = `rgba(${r},${g},${b},1)`;
            const ox = (hostRect.width - dw) / 2;
            const oy = (hostRect.height - dh) / 2;
            
            const px = x + ox;
            const py = y + oy;
            
            // [FIX] 根據 Y 座標計算啟動延遲
            const yRatio = Math.max(0, Math.min(1, (py - imageTopY) / dh)); // 0.0 (頂) 到 1.0 (底)
            const delay = (1.0 - yRatio) * STAGGER_DURATION; // 底部 (yRatio=1) 延遲 0, 頂部 (yRatio=0) 延遲 STAGGER_DURATION
            
            // [FIX] 隨機重力 (不同的掉落速度)
            const ay = BASE_GRAVITY + Math.random() * GRAVITY_RANGE;
            
            const vx = (Math.random() - 0.5) * INITIAL_RANDOM_SPEED_X;
            const vy = INITIAL_RANDOM_SPEED_Y + (Math.random() - 0.5) * (INITIAL_RANDOM_SPEED_X / 2);

            particles.push({ 
              x: px, y: py, ox: px, oy: py, 
              vx, vy, 
              ax: 0, ay, // 每個粒子有不同的重力
              size: particleSize, color,
              delay, // 啟動延遲
              startTime: 0, // 粒子自己的啟動時間
              landed: false, // 是否已觸底
              faded: false // 是否已淡出
            });
          }
        }
      }
      console.log(`${LOG_PREFIX} prepare(): Particle array created. Count: ${particles.length}`);
      console.groupEnd();
      return true;
      
    } catch (err) {
      console.error(`${LOG_PREFIX} prepare(): FAILED`, err);
      console.groupEnd();
      return false;
    }
  }

  /**
   * 繪製初始靜態圖
   */
  function drawStaticImage() {
    console.log(`${LOG_PREFIX} drawStaticImage(): Drawing static image to main canvas.`);
    if (!canvasRef.current || !imgBitmap || !hostRef.current) {
       console.warn(`${LOG_PREFIX} drawStaticImage(): Aborted (refs or imgBitmap not ready).`);
       return;
    }
    const ctx = canvasRef.current.getContext('2d');
    const hostRect = hostRef.current.getBoundingClientRect();
    if (!ctx) return;
    ctx.clearRect(0, 0, hostRect.width, hostRect.height);
    const scale = Math.min(hostRect.width / imgBitmap.width, hostRect.height / imgBitmap.height);
    const dw = Math.floor(imgBitmap.width * scale);
    const dh = Math.floor(imgBitmap.height * scale);
    const ox = (hostRect.width - dw) / 2;
    const oy = (hostRect.height - dh) / 2;
    ctx.globalAlpha = 1;
    ctx.drawImage(imgBitmap, ox, oy, dw, dh);
  }

  /**
   * 3. 開始動畫 (從下到上崩解效果)
   */
  function start() {
    console.group(`${LOG_PREFIX} start(): Animation triggered.`);
    if (!ready || running || !canvasRef.current) {
      console.warn(`${LOG_PREFIX} start(): Aborted (not ready, or running).`);
      console.groupEnd();
      return;
    }
    running = true; 
    t0 = performance.now(); 
    last = t0;
    console.log(`${LOG_PREFIX} start(): t0 = ${t0}`);
    
    const ctx = canvasRef.current.getContext('2d')!;
    let loopCount = 0;

    const loop = (now: number) => {
      if (loopCount === 0) console.log(`${LOG_PREFIX} loop(): First frame.`);
      loopCount++;

      if (!hostRef.current) {
        console.warn(`${LOG_PREFIX} loop(): Aborted (hostRef removed).`);
        running = false;
        cancelAnimationFrame(raf);
        console.groupEnd();
        return;
      }
        
      const dt = Math.min(33, now - last) / 1000;
      last = now;
      const globalElapsed = now - t0;
      
      const rect = hostRef.current.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.globalCompositeOperation = 'source-over';
      
      let allDone = true; // 追蹤動畫是否全部結束

      for (const p of particles) {
        // 1. 如果已觸底，畫在底部並跳過
        if (p.landed) {
          ctx.globalAlpha = 1; 
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
          allDone = false; // 還有粒子在畫面上
          continue;
        }
        
        // 2. 如果已淡出，跳過
        if (p.faded) {
          continue;
        }

        // 3. [FIX] 檢查是否到了啟動時間
        if (globalElapsed < p.delay) {
          // 延遲未到，畫在原始位置 (看起來像靜態圖)
          ctx.globalAlpha = 1;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.ox - p.size/2, p.oy - p.size/2, p.size, p.size);
          allDone = false; // 還有粒子在等待
          continue;
        }

        // 4. 粒子已啟動！
        allDone = false; // 還有粒子在動
        
        // 記錄粒子自己的啟動時間 (僅一次)
        if (p.startTime === 0) { 
          p.startTime = now; 
          // 啟動時使用原始位置
          p.x = p.ox;
          p.y = p.oy;
        }

        // 5. 計算物理
        p.ax = (Math.random() - 0.5) * TURBULENCE_STRENGTH; // 在每一幀都設置一個隨機的水平加速度，模擬風或亂流

        p.vx += p.ax * dt; 
        p.vy += p.ay * dt; // ay (重力) 是隨機的
        p.vx *= (1 - FRICTION * dt);
        p.vy *= (1 - FRICTION * dt); 
        p.x += p.vx * dt;  
        p.y += p.vy * dt;

        // 6. 碰撞檢測
        if (p.y + p.size / 2 >= rect.height) {
          p.y = rect.height - p.size / 2;
          p.vx = 0;
          p.vy = 0;
          p.ay = 0;
          p.landed = true;
          continue; // 這一幀先不畫，下一幀會畫在 'landed' 邏輯裡
        }

        // 7. 計算淡出 (基於粒子自己的生命週期)
        const particleElapsed = now - p.startTime;
        const progress = Math.min(1, particleElapsed / PARTICLE_LIFESPAN);
        const alpha = 1 - easeInCubic(progress);

        if (alpha <= 0) {
          p.faded = true;
          continue;
        }
        
        // 8. 繪製活動中的粒子
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      }

      // 9. 檢查結束條件
      if (allDone) {
        running = false; 
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, rect.width, rect.height); // 最終清空
        console.log(`${LOG_PREFIX} loop(): Final frame (all particles done, Total frames: ${loopCount}).`);
        console.groupEnd();
      } else {
        raf = requestAnimationFrame(loop);
      }
    };

    raf = requestAnimationFrame(loop);
  }

  /**
   * 5. React Effect Hook (使用 ResizeObserver)
   */
  useEffect(() => {
    console.log(`${LOG_PREFIX} useEffect[]: Mounting. Creating ResizeObserver.`);
    let mounted = true;
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(entries => {
      console.log(`${LOG_PREFIX} ResizeObserver: Fired.`);
      if (!mounted || !entries || !entries.length) return;
      const rect = entries[0].contentRect;
      if (rect.width === 0 || rect.height === 0) {
        console.warn(`${LOG_PREFIX} ResizeObserver: Host size is 0, skipping prepare.`);
        return; 
      }
      console.log(`${LOG_PREFIX} ResizeObserver: Host size valid (${rect.width}x${rect.height}). Running setup...`);
      if (!running) {
        resize();
        prepare().then((success) => {
          if (mounted && success) {
            drawStaticImage();
            console.log(`${LOG_PREFIX} ResizeObserver: setup() complete. Setting ready = true.`);
            setReady(true);
          } else if (!success) {
             console.error(`${LOG_PREFIX} ResizeObserver: setup() failed. Not setting ready.`);
          }
        });
      }
    });
    observer.observe(host);
    
    return () => { 
      console.log(`${LOG_PREFIX} useEffect[]: Unmounting. Cleaning up...`);
      mounted = false;
      observer.unobserve(host);
      cancelAnimationFrame(raf); 
      
      particles = []; 
      imgBitmap = null;
      t0 = 0;
      running = false;
      
      console.log(`${LOG_PREFIX} useEffect[]: Cleanup complete. (t0=${t0}, running=${running})`);
    };
  }, []);

  // 觸發事件
  const replayOnClick = true;
  
  const trigger = () => {
    console.log(`${LOG_PREFIX} trigger(): Click detected.`);
    if (running) {
       console.log(`${LOG_PREFIX} trigger(): Animation already running, ignoring.`);
       return;
    }
    if (!ready) {
       console.log(`${LOG_PREFIX} trigger(): Not ready, ignoring.`);
       return;
    }
    
    if (replayOnClick) {
      // [FIX] 簡化重播邏輯：只要不在運行中，就重新 prepare 並啟動
      if (t0 === 0) { // 第一次
        console.log(`${LOG_PREFIX} trigger(): Starting animation for the first time.`);
        // 第一次啟動時，我們需要先重置粒子 (因為 drawStaticImage 不該被看見)
        prepare().then((success) => {
           if(success) start();
        });
      } else { // 重播
        console.log(`${LOG_PREFIX} trigger(): Replaying animation.`);
        prepare().then((success) => {
          if (success) {
            // 重播時不需要 drawStaticImage，start() 會自己處理
            setTimeout(start, 16);
          }
        });
      }
    } else {
      if (t0 === 0) start();
    }
  };

  return (
    <div
      ref={hostRef}
      className="relative mx-auto w-full max-w-7xl aspect-[16/9] rounded-2xl overflow-hidden cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={trigger}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') trigger(); }}
      aria-label="Click to dissolve image"
    >
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 block" 
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-black/50">
          Loading image...
        </div>
      )}
    </div>
  );
}