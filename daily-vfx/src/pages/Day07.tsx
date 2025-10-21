// src/days/day07.tsx
import { useEffect, useRef } from "react";
import * as Tone from "tone";

import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// ==== Assets ====
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_ASSET_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";

// ==== Component ====
const Day07 = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ---------------------------
    // 0) DOM / 2D Context Setup
    // ---------------------------
    const host = hostRef.current;
    if (!host) return;

    const createLayer = () => {
      const cvs = document.createElement("canvas");
      const ctx = cvs.getContext("2d", { alpha: true })!;
      cvs.setAttribute(
        "style",
        "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"
      );
      return { cvs, ctx };
    };

    const videoEl = document.createElement("video");
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.style.display = "none";

    host.style.position = host.style.position || "relative";

    const base = createLayer();
    const fxly = createLayer();
    base.cvs.style.zIndex = "1";
    fxly.cvs.style.zIndex = "2";

    host.appendChild(base.cvs);
    host.appendChild(fxly.cvs);

    // ---------------------------
    // 1) Viewport / DPR & Mirror
    // ---------------------------
    type Point = { x: number; y: number };

    let viewWidth = 0;
    let viewHeight = 0;
    const updateViewSize = (w: number, h: number) => {
      viewWidth = w;
      viewHeight = h;
    };

    const shouldMirror = () => true;
    const mirrorPoint = (pt: Point) => ({ x: viewWidth - pt.x, y: pt.y });
    const toDisplayPoint = (pt: Point | null) => (pt ? (shouldMirror() ? mirrorPoint(pt) : pt) : null);

    const calcEpsilonPx = (shortEdge: number) => Math.max(1, shortEdge * 0.06);
    let epsPx = calcEpsilonPx(Math.min(viewWidth, viewHeight));

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(640, Math.floor(rect.width));
      const h = Math.max(360, Math.floor((w * 9) / 16));
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      host.style.height = `${h}px`;

      const applyCanvasSize = (cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
        cvs.width = Math.floor(w * dpr);
        cvs.height = Math.floor(h * dpr);
        cvs.style.width = `${w}px`;
        cvs.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      applyCanvasSize(base.cvs, base.ctx);
      applyCanvasSize(fxly.cvs, fxly.ctx);

      updateViewSize(w, h);
      epsPx = calcEpsilonPx(Math.min(w, h));
    };

    resize();
    window.addEventListener("resize", resize);

    // ---------------------------
    // 2) Types / State Buckets
    // ---------------------------
    type AppState = "IDLE" | "READY" | "DRAWING" | "COMPLETE" | "NEXT_SHAPE";
    type CircleShape = { type: "CIRCLE"; cx: number; cy: number; r: number; bins: boolean[] };
    type TriangleShape = { type: "TRIANGLE"; v: [Point, Point, Point]; edgeBins: boolean[][] };
    type Shape = CircleShape | TriangleShape;
    type TrackerResult = {
      hit: boolean;
      cornerPassed: boolean;
      complete: boolean;
      nearestPos?: Point;
      coveragePct: number;
    };

    const OFFPATH_FRAMES = 12;
    const CORNER_EPS_PX = 26;

    let appState: AppState = "IDLE";
    let lastPtAnalysis: Point | null = null; // 原始計算座標
    let lastPtDisplay: Point | null = null; // 鏡像後顯示座標
    let offpathFrames = 0;

    // ---------------------------
    // 3) Camera + HandLandmarker
    // ---------------------------
    async function initCamera(video: HTMLVideoElement): Promise<MediaStream> {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      return stream;
    }

    function readIndexTipFromResults(results: HandLandmarkerResult | null): Point | null {
      if (!results || !results.landmarks?.length) return null;
      const tip = results.landmarks[0]?.[8];
      if (!tip) return null;
      return { x: tip.x * viewWidth, y: tip.y * viewHeight };
    }

    async function initHandsTask(
      video: HTMLVideoElement,
      onTipPx: (pt: Point | null) => void
    ) {
      const vision = await FilesetResolver.forVisionTasks(WASM_ASSET_PATH);
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });

      let lastVideoTime = -1;
      let animId = 0;

      const loop = () => {
        if (video.readyState < 2 || video.currentTime === lastVideoTime) {
          animId = requestAnimationFrame(loop);
          return;
        }
        lastVideoTime = video.currentTime;

        const results = handLandmarker.detectForVideo(video, video.currentTime);
        onTipPx(results.landmarks && results.landmarks.length > 0 ? readIndexTipFromResults(results) : null);
        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);

      return {
        stop() {
          cancelAnimationFrame(animId);
          handLandmarker.close();
        },
      };
    }

    // ---------------------------
    // 4) Smoother (EMA)
    // ---------------------------
    function makeEma(alpha = 0.35) {
      let prev: Point | null = null;
      const fn = (pt: Point) => {
        if (!prev) {
          prev = pt;
          return pt;
        }
        prev = { x: prev.x + alpha * (pt.x - prev.x), y: prev.y + alpha * (pt.y - prev.y) };
        return prev;
      };
      fn.reset = () => {
        prev = null;
      };
      return fn;
    }
    let ema = makeEma(0.35);

    // ---------------------------
    // 5) Shape Builders & Utils
    // ---------------------------
    const makeCircle = (cx: number, cy: number, r: number): CircleShape => ({
      type: "CIRCLE",
      cx,
      cy,
      r,
      bins: Array(160).fill(false),
    });

    const makeTriangle = (v1: Point, v2: Point, v3: Point): TriangleShape => ({
      type: "TRIANGLE",
      v: [v1, v2, v3],
      edgeBins: [Array(80).fill(false), Array(80).fill(false), Array(80).fill(false)],
    });

    function enumerateSegments(flags: boolean[]) {
      const segments: Array<[number, number]> = [];
      for (let i = 0; i < flags.length;) {
        if (!flags[i]) {
          i++;
          continue;
        }
        const start = i;
        while (i < flags.length && flags[i]) i++;
        segments.push([start, i]);
      }
      return segments;
    }

    function drawVideoCover(
      ctx: CanvasRenderingContext2D,
      video: HTMLVideoElement,
      width: number,
      height: number
    ) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        ctx.drawImage(video, 0, 0, width, height);
        return;
      }
      const videoAspect = vw / vh;
      const canvasAspect = width / height;
      let sx = 0,
        sy = 0,
        sw = vw,
        sh = vh;
      if (videoAspect > canvasAspect) {
        const targetWidth = vh * canvasAspect;
        sx = (vw - targetWidth) / 2;
        sw = targetWidth;
      } else {
        const targetHeight = vw / canvasAspect;
        sy = (vh - targetHeight) / 2;
        sh = targetHeight;
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
    }

    // 圓形覆蓋（保持與原行為完全一致：鏡像後的角度與方向）
    function drawCircleCoverage(ctx: CanvasRenderingContext2D, circle: CircleShape) {
      if (!circle.bins.some(Boolean)) return;
      const len = circle.bins.length;
      const segments = enumerateSegments(circle.bins);
      if (!segments.length) return;

      const centerDisplay = toDisplayPoint({ x: circle.cx, y: circle.cy })!;

      ctx.save();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(59,130,246,0.92)";
      ctx.shadowColor = "rgba(59,130,246,0.45)";
      ctx.shadowBlur = 16;

      segments.forEach(([start, end]) => {
        const startT = start / len;
        const endT = end / len;
        const startAngle = startT * Math.PI * 2 - Math.PI;
        const endAngle = endT * Math.PI * 2 - Math.PI;

        // 水平鏡像：θ' = π - θ，且區段方向須交換
        const mStart = Math.PI - endAngle;
        const mEnd = Math.PI - startAngle;

        ctx.beginPath();
        ctx.arc(centerDisplay.x, centerDisplay.y, circle.r, mStart, mEnd);
        ctx.stroke();
      });

      ctx.restore();
    }

    function drawTriangleCoverage(ctx: CanvasRenderingContext2D, tri: TriangleShape) {
      const edges: [Point, Point, boolean[]][] = [
        [tri.v[0], tri.v[1], tri.edgeBins[0]],
        [tri.v[1], tri.v[2], tri.edgeBins[1]],
        [tri.v[2], tri.v[0], tri.edgeBins[2]],
      ];

      ctx.save();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(96,165,250,0.92)";
      ctx.shadowColor = "rgba(96,165,250,0.4)";
      ctx.shadowBlur = 14;

      edges.forEach(([a, b, bins]) => {
        if (!bins.some(Boolean)) return;
        const len = bins.length;
        enumerateSegments(bins).forEach(([start, end]) => {
          const startT = start / len;
          const endT = end / len;
          const pointOnEdge = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          const startPt = toDisplayPoint(pointOnEdge(startT))!;
          const endPt = toDisplayPoint(pointOnEdge(endT))!;
          ctx.beginPath();
          ctx.moveTo(startPt.x, startPt.y);
          ctx.lineTo(endPt.x, endPt.y);
          ctx.stroke();
        });
      });

      ctx.restore();
    }

    function renderScene(ctx: CanvasRenderingContext2D, shape: Shape, debugPt: Point | null) {
      ctx.clearRect(0, 0, viewWidth, viewHeight);

      // 影像：水平鏡像後再繪製（保持原行為）
      if (videoEl.readyState >= 2) {
        ctx.save();
        ctx.translate(viewWidth, 0);
        ctx.scale(-1, 1);
        drawVideoCover(ctx, videoEl, viewWidth, viewHeight);
        ctx.restore();
      } else {
        ctx.fillStyle = "#d1d5db";
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }

      // 指示點（白色）
      if (debugPt) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.arc(debugPt.x, debugPt.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // 幾何線稿
      ctx.save();
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (shape.type === "CIRCLE") {
        const centerDisplay = toDisplayPoint({ x: shape.cx, y: shape.cy })!;
        ctx.beginPath();
        ctx.arc(centerDisplay.x, centerDisplay.y, shape.r, 0, Math.PI * 2);
        ctx.stroke();
        drawCircleCoverage(ctx, shape);
      } else {
        const verts = shape.v.map((p) => toDisplayPoint(p)!);
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        ctx.lineTo(verts[1].x, verts[1].y);
        ctx.lineTo(verts[2].x, verts[2].y);
        ctx.closePath();
        ctx.stroke();
        drawTriangleCoverage(ctx, shape);
      }

      ctx.restore();
    }

    // ---------------------------
    // 6) Geom Helpers (tracker)
    // ---------------------------
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

    function nearestOnCircle(pt: Point, circle: CircleShape) {
      const ang = Math.atan2(pt.y - circle.cy, pt.x - circle.cx);
      const pos = { x: circle.cx + circle.r * Math.cos(ang), y: circle.cy + circle.r * Math.sin(ang) };
      const t = ((ang + Math.PI) / (Math.PI * 2) + 1) % 1;
      return { pos, t };
    }

    function nearestOnSegment(pt: Point, a: Point, b: Point) {
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const ap = { x: pt.x - a.x, y: pt.y - a.y };
      const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-6;
      const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / ab2));
      const pos = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      return { pos, t };
    }

    const markBin = (bins: boolean[], t: number) => {
      const idx = Math.min(bins.length - 1, Math.max(0, Math.floor(t * bins.length)));
      bins[idx] = true;
    };

    const coverage = (bins: boolean[]) => bins.filter(Boolean).length / bins.length;

    function trackOnce(pt: Point, currentShape: Shape, eps: number): TrackerResult {
      if (currentShape.type === "CIRCLE") {
        const near = nearestOnCircle(pt, currentShape);
        const hit = dist(pt, near.pos) < eps;
        if (hit) markBin(currentShape.bins, near.t);
        const cov = coverage(currentShape.bins);
        const complete = cov >= 0.88;
        return { hit, cornerPassed: false, complete, nearestPos: near.pos, coveragePct: cov };
      }

      const [a, b, c] = currentShape.v;
      const segments: [Point, Point, boolean[]][] = [
        [a, b, currentShape.edgeBins[0]],
        [b, c, currentShape.edgeBins[1]],
        [c, a, currentShape.edgeBins[2]],
      ];

      let edgeHit = false;
      let nearestPos: Point | undefined = undefined;
      let minD = Infinity;

      segments.forEach(([p1, p2, bins]) => {

        const { pos, t } = nearestOnSegment(pt, p1, p2);
        const d = dist(pt, pos);
        const hit = dist(pt, pos) < eps * 1.05;
        if (hit) {
          markBin(bins, t);
          edgeHit = true;
        }
        // 追蹤三條邊中「真正最近」的點，回傳給外面畫特效用

        if (d < minD) {
          minD = d;
          nearestPos = pos;
        }
      });




      const cornerPassed = [a, b, c].some((v) => dist(pt, v) < CORNER_EPS_PX);
      const covs = currentShape.edgeBins.map(coverage);
      const complete = covs.every((v) => v >= 0.82);
      const avg = covs.reduce((sum, v) => sum + v, 0) / covs.length;
      return { hit: edgeHit, cornerPassed, complete, nearestPos, coveragePct: avg };
    }

    // ---------------------------
    // 7) FX (particles)
    // ---------------------------
    type Particle = { p: Point; v: Point; life: number; ttl: number; color: string };
    let particles: Particle[] = [];

    function spawnParticles(p: Point, burst = 8, speed = 80, ttl = 700, color = "#60a5fa") {
      for (let i = 0; i < burst; i++) {
        const a = (Math.PI * 2 * i) / burst;
        particles.push({
          p: { ...p },
          v: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
          life: 0,
          ttl,
          color,
        });
      }
    }

    function fxTick(dt: number) {
      const ctx = fxly.ctx;
      ctx.clearRect(0, 0, fxly.cvs.width, fxly.cvs.height);
      particles = particles.filter((ptc) => {
        ptc.life += dt;
        const t = ptc.life / ptc.ttl;
        ptc.p.x += ptc.v.x * (dt / 1000);
        ptc.p.y += ptc.v.y * (dt / 1000);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = ptc.color;
        ctx.beginPath();
        ctx.arc(ptc.p.x, ptc.p.y, 3 + (1 - t) * 3, 0, Math.PI * 2);
        ctx.fill();
        return ptc.life < ptc.ttl;
      });
      ctx.globalAlpha = 1;
    }

    // ---------------------------
    // 8) SFX (Tone.js)
    // ---------------------------
    let toneReady = false;
    let toneSetupPromise: Promise<boolean> | null = null;
    let limiter: Tone.Limiter | null = null;
    let hitFilter: Tone.Filter | null = null;
    let hitSynth: Tone.NoiseSynth | null = null;

    let hitAutoFilter: Tone.AutoFilter | null = null;
    let hitAirReverb: Tone.Reverb | null = null;

    let cornerSynth: Tone.PolySynth<Tone.Synth> | null = null;
    let completeSynth: Tone.PolySynth<Tone.Synth> | null = null;
    let completeReverb: Tone.Reverb | null = null;

    const randomChoice = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

    async function ensureTone(): Promise<boolean> {
      if (toneReady) return true;
      if (toneSetupPromise) return toneSetupPromise;

      toneSetupPromise = (async () => {
        try {
          if (Tone.context.state !== "running") {
            await Tone.start();
          }
          limiter = new Tone.Limiter(-3).toDestination();
          completeReverb = new Tone.Reverb({ decay: 2.8, wet: 0.35 }).connect(limiter);
          // ===== airy hit =====
          hitFilter = new Tone.Filter({ type: "bandpass", Q: 8, frequency: 1100 }).connect(limiter);

          // 自動掃頻，營造科幻的移動感
          hitAutoFilter = new Tone.AutoFilter({
            frequency: 0.7,          // LFO 速率（Hz）
            baseFrequency: 400,      // 掃頻下限
            octaves: 3,              // 掃 3 octaves
            type: "sine",
          }).start();
          // 長一點、比較空靈的殘響（濕一點）
          hitAirReverb = new Tone.Reverb({ decay: 3.2, wet: 0.45 }).connect(limiter);

          // Pink noise 比 white 更柔和，搭配稍長一點的衰減
          hitSynth = new Tone.NoiseSynth({
            noise: { type: "pink" },
            envelope: { attack: 0.004, decay: 0.28, sustain: 0, release: 0.18 },
          });
          // 鏈路：Noise → AutoFilter → 帶通 → (乾)Limiter + (濕)Reverb
          hitSynth.connect(hitAutoFilter);
          hitAutoFilter.connect(hitFilter);
          // 讓帶通的輸出也進一條 Reverb（同時保留原本乾訊號到 limiter）
          hitFilter.connect(hitAirReverb);

          cornerSynth = new Tone.PolySynth(Tone.Synth, {
            envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.24 },
            oscillator: { type: "triangle" },
          }).connect(limiter);

          completeSynth = new Tone.PolySynth(Tone.Synth, {
            envelope: { attack: 0.02, decay: 0.25, sustain: 0.05, release: 0.7 },
            oscillator: { type: "sawtooth" },
          }).connect(completeReverb);

          toneReady = true;
          return true;
        } catch (err) {
          console.error("[SFX.ensureTone] failed", err);
          return false;
        } finally {
          toneSetupPromise = null;
        }
      })();

      return toneSetupPromise;
    }

    const handlePointerDown = () => {
      ensureTone().catch((err) => console.error("[SFX.pointerdown] ensureTone failed", err));
    };
    host.addEventListener("pointerdown", handlePointerDown, { once: true });

    async function playSound(type: "hit" | "corner" | "complete") {
      const ready = await ensureTone();
      if (!ready) return;

      const now = Tone.now();
      if (type === "hit") {
        if (hitFilter) {
          const freq = 900 + Math.random() * 900;
          hitFilter.frequency.setValueAtTime(freq, now);
        }
        hitSynth?.triggerAttackRelease("16n", now, 0.6);
        return;
      }

      if (type === "corner") {
        const chords = [
          ["C4", "E4", "G4"],
          ["D4", "F#4", "A4"],
          ["F4", "A4", "C5"],
        ];
        cornerSynth?.triggerAttackRelease(randomChoice(chords), "8n", now, 0.4);
        return;
      }

      const arp = randomChoice<readonly string[]>([
        ["C4", "E4", "G4", "B4", "D5"],
        ["A3", "C4", "E4", "G4", "B4"],
        ["F3", "A3", "C4", "E4", "G4"],
      ]);
      const step = 0.14;
      arp.forEach((note, idx) => {
        completeSynth?.triggerAttackRelease(note, "16n", now + idx * step, 0.48);
      });
    }

    // ---------------------------
    // 9) Shape state & factory
    // ---------------------------
    let shape: Shape = makeCircle(
      viewWidth / 2,
      viewHeight / 2,
      Math.min(viewWidth, viewHeight) * 0.28
    );

    function makeNextShape(prev: Shape): Shape {
      if (prev.type === "CIRCLE") {
        return makeTriangle(
          { x: viewWidth * 0.22, y: viewHeight * 0.78 },
          { x: viewWidth * 0.78, y: viewHeight * 0.78 },
          { x: viewWidth * 0.5, y: viewHeight * 0.2 }
        );
      }
      return makeCircle(
        viewWidth / 2,
        viewHeight / 2,
        Math.min(viewWidth, viewHeight) * 0.28
      );
    }

    // ---------------------------
    // 10) Bootstrap camera + hands
    // ---------------------------
    let handsStopper: { stop: () => void } | null = null;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await initCamera(videoEl);
        handsStopper = await initHandsTask(videoEl, (pt) => {
          if (pt) {
            const smooth = ema(pt);
            lastPtAnalysis = smooth; // 原始（未鏡像）
            lastPtDisplay = toDisplayPoint(smooth); // 顯示（鏡像後）
          } else {
            lastPtAnalysis = null;
            lastPtDisplay = null;
            offpathFrames = 0;
            ema.reset();
          }
        });
      } catch (e) {
        console.error("[bootstrap] failed to start camera/hands", e);
      }
    })();

    // ---------------------------
    // 11) Main loop
    // ---------------------------
    let raf = 0;
    let lastTime = performance.now();

    function loop(now: number) {
      const dt = now - lastTime;
      lastTime = now;

      // 畫面
      renderScene(base.ctx, shape, lastPtDisplay);

      // 狀態機
      if (appState === "IDLE") appState = "READY";
      if (lastPtAnalysis && appState === "READY") appState = "DRAWING";

      // 互動追蹤
      if (lastPtAnalysis && lastPtDisplay && appState === "DRAWING") {
        const result = trackOnce(lastPtAnalysis, shape, epsPx);

        // 原始最近點（用於標記 bins）；顯示位置用鏡像
        const nearestDisplay = result.nearestPos ? toDisplayPoint(result.nearestPos) : null;

        if (nearestDisplay && result.hit) {
          spawnParticles(nearestDisplay, 7, 70, 520, "#60a5fa");
          void playSound("hit");
        }
        if (result.cornerPassed) {
          spawnParticles(nearestDisplay!, 14, 110, 820, "#60a5fa");
          void playSound("corner");
        }
        if (result.complete) {
          const burstPos = nearestDisplay ?? lastPtDisplay!;
          spawnParticles(burstPos, 28, 160, 1200, "#60a5fa");
          void playSound("complete");
          appState = "COMPLETE";
          setTimeout(() => {
            shape = makeNextShape(shape);
            appState = "READY";
            particles = [];
            lastPtAnalysis = null;
            lastPtDisplay = null;
            ema = makeEma(0.35);
          }, 800);
        }

        offpathFrames = result.hit ? 0 : offpathFrames + 1;
        if (offpathFrames >= OFFPATH_FRAMES) {
          console.log("[Hint] Try staying closer to the path");
        }
      }

      // 粒子層
      fxTick(dt);

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);

    // ---------------------------
    // 12) Cleanup
    // ---------------------------
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      handsStopper?.stop?.();
      stream?.getTracks().forEach((t) => t.stop());
      host.removeEventListener("pointerdown", handlePointerDown);

      // Tone nodes
      if (toneReady) {
        hitSynth?.dispose();
        cornerSynth?.dispose();
        completeSynth?.dispose();
        hitFilter?.dispose();
        completeReverb?.dispose();
        limiter?.dispose();
      }

      // DOM
      host.removeChild(base.cvs);
      host.removeChild(fxly.cvs);
      if (videoEl.srcObject) {
        (videoEl.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      }
      videoEl.srcObject = null;
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div
        ref={hostRef}
        className="w-full bg-gray-100 relative overflow-hidden rounded-xl border"
      />
    </div>
  );
};

export default Day07;
