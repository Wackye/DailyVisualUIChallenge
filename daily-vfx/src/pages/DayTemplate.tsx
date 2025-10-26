// src/days/Daily01.tsx
import { useRef, useEffect } from "react";

// Change name here
const DailyTemplate = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1️⃣ 建立 <canvas> 元素並掛到 hostRef
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    host.appendChild(canvas);

    // Start your creation





    // end your creation
    return () => {
      host.removeChild(canvas);
    };
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div ref={hostRef} className="w-full aspect-[16/9] bg-gray-100" />
    </div>
  );
};

export default DailyTemplate;
