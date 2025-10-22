import React, { useEffect, useRef } from "react";

const Day08 = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const items = Array.from(host.querySelectorAll<HTMLElement>("[data-layer]"));

    // 全域調整：位移、平滑、層級對比（gamma）
    const MAX_TRANSLATE = 24; // px
    const LERP = 0.12;
    const GAMMA = 1.6;        // >1 會放大「近景 vs 遠景」差異

    const s = { nx: 0, ny: 0, tx: 0, ty: 0, raf: 0 };

    function onPointerMove(e: PointerEvent) {
      const rect = host.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      s.nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      s.ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
    }
    function onLeave() { s.nx = 0; s.ny = 0; }

    function tick() {
      s.tx += (s.nx - s.tx) * LERP;
      s.ty += (s.ny - s.ty) * LERP;

      for (const el of items) {
        const w = Math.max(0, Math.min(1, Number(el.dataset.layer || "0.5")));
        const effective = Math.pow(w, GAMMA); // 放大層級差
        const dx = s.tx * MAX_TRANSLATE * effective;
        const dy = s.ty * MAX_TRANSLATE * effective;
        el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      }
      s.raf = requestAnimationFrame(tick);
    }

    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    s.raf = requestAnimationFrame(tick);

    return () => {
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(s.raf);
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* 固定 3854×2160 的比例盒，縮放保持等比 */}
      <div
        ref={hostRef}
        className="relative w-full rounded-lg overflow-hidden bg-gray-900"
        style={{ aspectRatio: "3854 / 2160" }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          {/* 背景 & main：給很小但可見的權重 */}
          <div data-layer="0.15" style={{ position: "absolute", inset: 0 }}>
            <img
              style={{ position: "absolute", width: "100%", height: "100%", left: "0%", top: "0%" }}
              src="/day08/layer4_bg.png"
              alt="Background"
              draggable={false}
            />
          </div>
          <div data-layer="0.3" style={{ position: "absolute", inset: 0 }}>
            <img
              style={{ position: "absolute", width: "99.948106%", height: "100%", left: "0%", top: "0%" }}
              src="/day08/main.png"
              alt="Main background"
              draggable={false}
            />
          </div>

          {/* 建築層（遠 → 近）權重更拉開 */}
          <div data-layer="0.80" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "24.481059%", height: "89.606481%", left: "0%", top: "0%" }}
              src="/day08/layer1_building_left.png" alt="Left building" draggable={false} />
          </div>
          <div data-layer="0.80" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "22.223664%", height: "87.12963%", left: "77.525169%", top: "0%" }}
              src="/day08/layer1_building_right.png" alt="Right building" draggable={false} />
          </div>

          <div data-layer="0.45" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "18.552154%", height: "59.050926%", left: "16.371043%", top: "20.398611%" }}
              src="/day08/layer2_building_left.png" alt="Mid-left building" draggable={false} />
          </div>
          <div data-layer="0.45" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "8.316035%", height: "63.634259%", left: "57.745719%", top: "9.60787%" }}
              src="/day08/layer2_building_right.png" alt="Mid-right building" draggable={false} />
          </div>

          {/* 塔與結構（中後 → 中前） */}
          <div data-layer="0.35" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "5.371043%", height: "20.509259%", left: "50.155682%", top: "37.268519%" }}
              src="/day08/layer3_tower.png" alt="Tower" draggable={false} />
          </div>
          <div data-layer="0.35" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "7.213285%", height: "38.125%", left: "49.221588%", top: "24.305556%" }}
              src="/day08/layer3_101.png" alt="101 Building" draggable={false} />
          </div>
          <div data-layer="0.60" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "12.231707%", height: "30.800926%", left: "48.986508%", top: "39.934722%" }}
              src="/day08/layer3_front_building.png" alt="Front building" draggable={false} />
          </div>
          <div data-layer="0.68" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "7.719253%", height: "13.564815%", left: "44.450441%", top: "57.16713%" }}
              src="/day08/layer3_temple.png" alt="Temple" draggable={false} />
          </div>

          {/* 樹木（前景） */}
          <div data-layer="0.95" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "7.537623%", height: "26.712963%", left: "18.542294%", top: "55.335185%" }}
              src="/day08/layer1_tree.png" alt="Tree" draggable={false} />
          </div>
          <div data-layer="0.92" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "6.518682%", height: "23.101852%", left: "25.635703%", top: "54.166667%" }}
              src="/day08/layer1_tree-1.png" alt="Tree variant" draggable={false} />
          </div>
          <div data-layer="0.92" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "6.707317%", height: "23.726852%", left: "61.898028%", top: "52.696759%" }}
              src="/day08/layer1_tree2.png" alt="Tree variant 2" draggable={false} />
          </div>

          {/* 欄杆/柱件（中前/前景） */}
          <div data-layer="0.88" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "3.775298%", height: "13.425926%", left: "77.440062%", top: "21.66713%" }}
              src="/day08/layer1_bar1.png" alt="Bar element" draggable={false} />
          </div>
          <div data-layer="0.86" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "3.425013%", height: "11.62037%", left: "18.542294%", top: "58.735185%" }}
              src="/day08/layer1_bar2.png" alt="Bar element 2" draggable={false} />
          </div>
          <div data-layer="0.86" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "3.00986%", height: "11.319444%", left: "30.984432%", top: "38.590278%" }}
              src="/day08/layer1_bar3.png" alt="Bar element 3" draggable={false} />
          </div>
          <div data-layer="0.88" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "3.866113%", height: "14.953704%", left: "70.202128%", top: "2.106019%" }}
              src="/day08/layer1_bar4.png" alt="Bar element 4" draggable={false} />
          </div>
          <div data-layer="0.74" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "3.775298%", height: "13.425926%", left: "56.811105%", top: "43.080556%" }}
              src="/day08/layer1_bar1-1.png" alt="Bar element variant" draggable={false} />
          </div>

          {/* 車輛（最前景） */}
          <div data-layer="1.0" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "9.120394%", height: "16.50463%", left: "36.040477%", top: "68.194444%" }}
              src="/day08/layer1_truck.png" alt="Truck" draggable={false} />
          </div>
          <div data-layer="0.98" style={{ position: "absolute", inset: 0 }}>
            <img style={{ position: "absolute", width: "1.608718%", height: "6.296296%", left: "51.453036%", top: "70.138889%" }}
              src="/day08/layer1_motor.png" alt="Motor" draggable={false} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Day08;
