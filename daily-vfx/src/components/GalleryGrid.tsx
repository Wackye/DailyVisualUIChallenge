import { Grid } from "lucide-react";
import type { Day } from "../types/day";
import GalleryCard from "./GalleryCard"; // 確保路徑正確

type GalleryGridProps = {
  days: Day[];
};

function GalleryGrid({ days }: GalleryGridProps) {
  if (days.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-white py-20 text-gray-400">
        <Grid className="mb-4 h-10 w-10 opacity-60" />
        <p className="text-xl font-medium">目前還沒有作品</p>
        <p className="mt-2 text-sm">請在 daysData 中新增作品來展示。</p>
      </div>
    );
  }

  return (
    <section className="mx-auto p-8 grid w-full grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {days.map((day) => (
        <GalleryCard key={day.id} day={day} />
      ))}
    </section>
  );
}

export default GalleryGrid;
