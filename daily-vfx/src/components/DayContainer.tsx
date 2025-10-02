import { ChevronLeft, Globe, Share2 } from "lucide-react";
import type { Day } from "../types/day";

type DayContainerProps = {
  day: Day;
  onBack?: () => void; // 可選：如果沒有傳，就隱藏返回按鈕
};

function DayContainer({ day, onBack }: DayContainerProps) {
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("作品連結已複製到剪貼簿！");
    } catch {
      alert("無法複製，請手動複製網址列。");
    }
  };

  const DynamicComponent = day.component; // 這裡拿到元件

  return (
    <section className="flex flex-col flex-1 p-10" >
      <div className="flex-1 flex items-center justify-center rounded-xl w-full">
        {DynamicComponent ? <DynamicComponent /> : (
          <div className="p-8 text-center text-gray-400">
            To be continued...
          </div>
        )}
      </div>
    </section >
  );
}

export default DayContainer;
