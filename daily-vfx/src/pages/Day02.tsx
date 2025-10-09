import React, { useRef, useEffect, useState } from "react";

// --- 修正錯誤: TypeScript 宣告 (Declaration) ---
// 宣告 p5 和 Tone 存在於全域 window 物件上
declare global {
  interface Window {
    p5: any; // p5.js instance, using 'any' due to dynamic loading and lack of official types
    Tone: any; // Tone.js instance, using 'any' due to dynamic loading and lack of official types
  }
}

// 1. 定義形狀設定的介面 (Interface)
interface ShapeConfig {
  type: 'circle' | 'square' | 'triangle';
  color: string;
  size: number;
  notes: string[];
  synthType: 'MembraneSynth' | 'Synth' | 'DuoSynth';
}

// 2. 定義 p5 實例的介面 (Interface)
interface P5Sketch {
  random: (max: number) => number;
  fill: (color: string) => void;
  noStroke: () => void;
  ellipse: (x: number, y: number, w: number, h: number) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  triangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => void;
  // p5 system methods
  createCanvas: (w: number, h: number) => { parent: (host: HTMLDivElement) => void; };
  parent: (host: HTMLDivElement) => void;
  rectMode: (mode: any) => void;
  angleMode: (mode: any) => void;
  background: (r: number, g: number, b: number, a?: number) => void;
  width: number;
  height: number;
  resizeCanvas: (w: number, h: number) => void;
}

// Change name here
const Daily02 = () => {
  const hostRef = useRef<HTMLDivElement | null>(null); 
  const [isToneReady, setIsToneReady] = useState<boolean>(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState<boolean>(false); 
  const isGameActive = useRef<boolean>(false);
  // --- 修正需求: C4 到 C7 的五聲音階 ---
  // 定義 C Pentatonic Scale (C D E G A) 橫跨四個八度
  const PENTATONIC_SCALE: string[] = [
    'C4', 'D4', 'E4', 'G4', 'A4',
    'C5', 'D5', 'E5', 'G5', 'A5',
    'C6', 'D6', 'E6', 'G6', 'A6',
    'A3'
  ];

  // 使用明確的 ShapeConfig[] 陣列型別
  const SHAPE_CONFIGS: ShapeConfig[] = [
    {
      type: 'circle',
      color: '#34D399', 
      size: 20, 
      notes: PENTATONIC_SCALE, // <-- 應用新的五聲音階
      synthType: 'MembraneSynth', 
    },
    {
      type: 'square',
      color: '#FBBF24', 
      size: 40, 
      notes: PENTATONIC_SCALE, // <-- 應用新的五聲音階
      synthType: 'Synth', 
    },
    {
      type: 'triangle',
      color: '#F87171', 
      size: 50, 
      notes: PENTATONIC_SCALE, // <-- 應用新的五聲音階
      synthType: 'DuoSynth', 
    },
  ];

  /**
   * Particle class to manage position, velocity, and drawing for each shape.
   */
  class Particle {
    p: P5Sketch; 
    config: ShapeConfig; 
    width: number;
    height: number;
    synth: any; 
    x: number; 
    y: number; 
    vx: number;
    vy: number;
    // --- 修正 Error 1: 碰撞冷卻機制 ---
    COOLDOWN_FRAMES: number = 5; // 設置冷卻幀數，例如 5 幀 (約 1/12 秒)
    framesSinceBounce: number = 0;
    flashFrames: number = 0;

    constructor(p: P5Sketch, config: ShapeConfig, width: number, height: number, synth: any) { 
      this.p = p; 
      this.config = config;
      this.width = width;
      this.height = height;
      this.synth = synth;
      this.framesSinceBounce = 0; // 初始化計數器
      this.flashFrames = 0; // 初始化閃爍計時器

      // Initial state
      this.x = p.random(width);
      this.y = p.random(height);

      // Random initial velocity (ensure it's not too slow or fast)
      const minSpeed: number = 0.5;
      const maxSpeed: number = 3;
      const randomSpeed: number = (this.p.random(1) * (maxSpeed - minSpeed)) + minSpeed;
      
      // 使用 Math.sign() 確定方向
      this.vx = randomSpeed * Math.sign(this.p.random(1) - 0.5);
      this.vy = randomSpeed * Math.sign(this.p.random(1) - 0.5);
    }

    // Get a random note from the shape's configuration
    getRandomNote(): string {
      const notes = this.config.notes;
      return notes[Math.floor(this.p.random(notes.length))];
    }

    // Update position and check for wall collisions
    update(): void { 
      let bounced: boolean = false; 
      this.framesSinceBounce++; // 每幀增加計數器

      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Wall collision detection and sound trigger
      const size: number = this.config.size;
      const radius: number = this.config.type === 'circle' ? size : size / 2; 

      // 水平碰撞 (Left/Right)
      if (this.x - radius < 0 || this.x + radius > this.width) {
        this.vx *= -1; 
        if (this.x - radius < 0) this.x = radius;
        if (this.x + radius > this.width) this.x = this.width - radius;
        bounced = true;
      }

      // 垂直碰撞 (Top/Bottom)
      if (this.y - radius < 0 || this.y + radius > this.height) {
        this.vy *= -1; 
        if (this.y - radius < 0) this.y = radius;
        if (this.y + radius > this.height) this.y = this.height - radius;
        bounced = true;
      }

      // 觸發聲音邏輯：只有在發生碰撞 且 超過冷卻時間 且 Tone Ready 時才發聲
      if (bounced && this.framesSinceBounce > this.COOLDOWN_FRAMES && window.Tone && window.Tone.context.state === 'running') {

        // 碰撞後立即閃爍
        this.flashFrames = 5; 

        // 使用 Tone.now() 確保排程正確
        this.synth.triggerAttackRelease(this.getRandomNote(), '8n', window.Tone.now(), 0.8);
        this.framesSinceBounce = 0; // 重置計數器
      }
    }

    // Draw the shape on the p5 canvas
    draw(): void { 
      const p = this.p;
      p.fill(this.config.color);
      p.noStroke(); 

      if (this.flashFrames > 0) {
        p.fill('rgba(255, 255, 255, 0.8)');
        this.flashFrames--;
      }

      switch (this.config.type) {
        case 'circle':
          p.ellipse(this.x, this.y, this.config.size * 2, this.config.size * 2); 
          break;
        case 'square':
          const s: number = this.config.size;
          p.rect(this.x, this.y, s, s); 
          break;
        case 'triangle':
          const h: number = this.config.size; 
          const side: number = h / (Math.sqrt(3) / 2); 
          const r: number = side * (Math.sqrt(3) / 3); 
          
          const x1: number = this.x;
          const y1: number = this.y - r * 2 / 3; 
          const x2: number = this.x - side / 2;
          const y2: number = this.y + r / 3; 
          const x3: number = this.x + side / 2;
          const y3: number = this.y + r / 3; 
          
          p.triangle(x1, y1, x2, y2, x3, y3);
          break;
      }
    }
  }

  // --- 新增：處理點擊啟動音訊的函式 ---
  const startAudioContext = () => {
    const Tone = window.Tone;
    // 檢查 AudioContext 狀態，避免在 'closed' 狀態下呼叫 start()
    if (Tone && Tone.context.state !== 'running' && Tone.context.state !== 'closed') {
        Tone.start().then(() => {
            console.log("Tone.js 音訊環境已啟動.");
            setIsToneReady(true); 
            isGameActive.current = true;
        });
    }
  };

  // Effect 1: Load p5.js and Tone.js scripts dynamically
  useEffect((): (() => void) => { 
    const TONE_JS_CDN: string = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js';
    const P5_JS_CDN: string = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.min.js';
    let scriptsLoadedCount: number = 0;
    const totalScripts: number = 2;

    const scriptLoaded = (): void => {
      scriptsLoadedCount++;
      if (scriptsLoadedCount === totalScripts) {
        console.log("p5.js 和 Tone.js 函式庫載入成功.");
        setIsScriptLoaded(true);
      }
    };

    const loadScript = (src: string): void => { 
      if (document.querySelector(`script[src="${src}"]`)) {
          scriptLoaded(); 
          return;
      }
      const script: HTMLScriptElement = document.createElement('script'); 
      script.src = src;
      script.async = true;
      script.onload = scriptLoaded;
      script.onerror = () => console.error(`函式庫載入失敗: ${src}`);
      document.head.appendChild(script);
    };

    loadScript(P5_JS_CDN);
    loadScript(TONE_JS_CDN);

    return () => {
      // Cleanup is minimal for CDN loaded scripts in this context
    };
  }, []); 

  // Effect 2: Setup p5 Sketch and Audio Logic
  useEffect(() => {
    // 嚴格檢查函式庫載入狀態
    if (!isScriptLoaded || typeof window.p5 === 'undefined' || typeof window.Tone === 'undefined') return; 

    // 嚴格檢查 hostRef 是否存在
    const host: HTMLDivElement | null = hostRef.current;
    if (!host) return;

    let particles: Particle[] = []; 
    let synths: Record<string, any> = {}; 

    // --- Tone.js Setup ---
    const initTone = () => {
      const Tone = window.Tone; // 使用一個區域變數來避免重複存取 window

      // Add a Reverb effect for ambiance
      const reverb = new Tone.Reverb({ decay: 2, wet: 0.3 }).toDestination();

      // Initialize Synths
      SHAPE_CONFIGS.forEach((config: ShapeConfig) => { 
        let synth;
        switch (config.synthType) {
          case 'MembraneSynth':
            synth = new Tone.MembraneSynth({
              pitchDecay: 0.05,
              octaves: 8,
              oscillator: { type: 'sine' },
              envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 }
            }).connect(reverb);
            break;
          case 'DuoSynth':
            synth = new Tone.DuoSynth({
              vibratoAmount: 0.5,
              vibratoRate: 5,
              portamento: 0.0,
              harmonicity: 1.005,
              voice0: {
                volume: -10,
                oscillator: { type: 'sawtooth' },
                filter: { Q: 2, type: 'lowpass', rolloff: -24 },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.6 }
              },
              voice1: {
                volume: -10,
                oscillator: { type: 'sine' },
                filter: { Q: 2, type: 'lowpass', rolloff: -24 },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.6 }
              }
            }).connect(reverb);
            break;
          case 'Synth':
          default:
            synth = new Tone.Synth({
              oscillator: { type: 'triangle' },
              envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 }
            }).connect(reverb);
            break;
        }
        synths[config.type] = synth;
      });
      console.log('initTone finish');

      return synths;
    };


    // --- p5 Sketch ---
    const sketch = (p: any) => { 
      let p5Synths: Record<string, any>; 
      
      p.setup = () => {
        const canvas = p.createCanvas(host.clientWidth, host.clientHeight);
        canvas.parent(host);
        
        p.rectMode(p.CENTER); 
        p.angleMode(p.DEGREES);
        
        p5Synths = initTone();

        // 初始化粒子
        SHAPE_CONFIGS.forEach((config: ShapeConfig) => {
          for (let i = 0; i < 3; i++) {
            const particle = new Particle(p, config, p.width, p.height, p5Synths[config.type]);
            particles.push(particle);
          }
        });
        console.log("p5 setup finish");
      };

      p.draw = () => {
        console.log('p5 first draw');
        p.background(15, 23, 42); 
        
        particles.forEach((pt: Particle) => { 
          pt.width = p.width;
          pt.height = p.height;
          
          // 只有在音訊準備好 (點擊後) 才執行移動 (update)
          if (isGameActive.current) {
            console.log('p5 update');
            pt.update();// 總是繪製粒子 (draw)，確保在點擊前可見
            pt.draw();
          }
          

        });
      };
      
      p.windowResized = () => {
        p.resizeCanvas(host.clientWidth, host.clientHeight);
      };
      
  };

    // 創建 p5 實例
    const p5Instance = new window.p5(sketch, host);

    // Cleanup function
    return () => {
      p5Instance.remove();
      
      // 關閉 Tone.js context 並釋放資源
      if (isScriptLoaded && window.Tone && window.Tone.context.state !== 'closed') {
          Object.values(synths).forEach((synth: any) => synth.dispose()); 
          // 只有在元件卸載時才真正關閉 context
          window.Tone.context.close();
      }
    };
  }, [isScriptLoaded]); 

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-2">🎵 幾何碰撞音樂互動 (p5.js + Tone.js)</h2>
      <div
        ref={hostRef}
        // 新增 relative 確保子元素能絕對置中
        className="w-full aspect-video bg-gray-900 rounded-lg shadow-xl overflow-hidden cursor-pointer relative"
      >
        {/* 顯示載入狀態給使用者 */}
        {!isScriptLoaded ? (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg animate-pulse bg-gray-600 p-4 rounded-md text-white">
                正在載入 p5.js 和 Tone.js 函式庫...
            </span>
        ) : !isToneReady ? (
            <span 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg animate-pulse bg-gray-800 p-4 rounded-md text-white"
                onClick={startAudioContext}
            >                點擊畫面開始音訊...
            </span>
        ) : null}
      </div>
    </div>
  );
};

export default Daily02;
