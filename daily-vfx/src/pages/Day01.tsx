import { useRef, useEffect } from "react";

// Change name here
const Day01 = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1️⃣ 建立 <canvas> 元素並掛到 hostRef
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    host.appendChild(canvas);

    // Start your creation
    canvas.width = host.clientWidth;
    canvas.height = Math.round((canvas.width * 9) / 16); // 16:9 畫布

    // @ts-ignore
    let raf = 0;

    // === 3) 滑鼠速度偵測相關變數 ===
    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;

    // @ts-ignore
    let isInside = false;
    let alpha = 0;               // 目前透明度 0~1
    let targetAlpha = 0;         // 目標透明度 0 或 1
    let FADE_SPEED = 0.01;    // 透明度變化速度

    const number = 24;
    type Follower = {
      x: number, y: number; r: number, k: number, color: string, hollow?: boolean
    };
    const followers: Follower[] = [];
    for (let i = 0; i < number; i++) {
      const isHollow = Math.random() < 0.4;
      const r = 8 + Math.random() * 8;
      const k = 0.02 + Math.random() * 0.2;
      followers.push({
        x: mouseX,
        y: mouseY,
        r: r,
        k,
        color: `hsl(${Math.round(Math.random() * 360)}, 70%, 60%)`,
        hollow: isHollow
      })
    }



    // 取得滑鼠在畫布內的位置
    const getPos = (e: any) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = getPos(e);
      mouseX = x;
      mouseY = y;

      isInside = true;
      targetAlpha = 1;
    };

    const updatePos = () => {

      for (let i = 0; i < followers.length; i++) {
        const f = followers[i];
        if (targetAlpha < alpha) {
          f.x = f.x + (mouseX - f.x) * 0.01;
          f.y = f.y + (mouseY - f.y) * 0.01;
        }
        else {
          f.x = f.x * (1 - f.k) + (mouseX + (Math.random() - 0.5) * 40) * f.k;
          f.y = f.y * (1 - f.k) + (mouseY + (Math.random() - 0.5) * 40) * f.k;
        }
      }

    }

    const onEnter = () => {
      isInside = true;
      targetAlpha = 1;
    }
    const onLeave = () => {
      isInside = false;
      targetAlpha = 0;
    }

    // 監聽滑鼠移動
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);

    const render = () => {
      // 放在 render() 一開始背景重畫之後
      alpha += (targetAlpha - alpha) * FADE_SPEED;

      // 可選：剪裁確保在 0~1 之間
      if (alpha < 0.001) alpha = 0;
      if (alpha > 0.999) alpha = 1;

      updatePos();

      if (alpha > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.globalAlpha = alpha;
        // 畫出所有 followers
        for (let i = followers.length - 1; i >= 0; i--) {
          const f = followers[i];
          ctx.beginPath();
          ctx.fillStyle = f.color;
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);

          if (f.hollow) {
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          else {
            ctx.fill();
          }
        }
        ctx.restore
      }
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    // end your creation
    return () => {
      host.removeChild(canvas);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div ref={hostRef} className="w-full bg-gray-100" />
    </div>
  );
};

export default Day01;
