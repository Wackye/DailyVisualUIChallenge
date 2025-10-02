// src/days/Daily01.tsx
import React, { useRef, useEffect } from "react";

// Change name here
const DailyTemplate = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1️⃣ 建立 <canvas> 元素並掛到 hostRef
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    host.appendChild(canvas);

    // Start your creation





    // end your creation
    return () => {
      host.removeChild(canvas);
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div ref={hostRef} className="w-full h-[450px] bg-gray-100" />
    </div>
  );
};

export default DailyTemplate;
