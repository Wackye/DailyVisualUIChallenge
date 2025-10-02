// src/components/GalleryCard.tsx
import { useNavigate } from "react-router-dom";
import type { Day } from "../types/day";

type Props = {
  day: Day;
};

function GalleryCard({ day }: Props) {
  const navigate = useNavigate();
  const hasComponent = !!day.component;

  return (
    <div
      onClick={() => hasComponent && navigate(`/day/${day.id}`)}
      className={`group block overflow-hidden rounded-xl border bg-white shadow-md transition ${hasComponent
        ? "cursor-pointer hover:shadow-xl hover:-translate-y-1"
        : "cursor-not-allowed opacity-60"
        }`}
    >
      <img
        src={day.thumb}
        alt={day.title}
        className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="p-4">
        <h2 className="font-bold text-gray-800 group-hover:text-indigo-600">
          {day.title}
        </h2>
        <p className="text-sm text-gray-500">{day.description}</p>
      </div>
    </div>
  );
}

export default GalleryCard;
