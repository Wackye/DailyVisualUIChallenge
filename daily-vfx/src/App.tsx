import React, { useEffect, useState } from "react";
import { lazy } from "react";
import "./index.css";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";

import Day01 from "./pages/Day01";
import type { Day } from "./types/day";
import Header from "./components/Header";
import DayContainer from "./components/DayContainer";
import GalleryGrid from "./components/GalleryGrid";
//



export const dayModules = {
  1: lazy(() => import("./pages/Day01")), // ← 這裡指向 Daily01.tsx
  // 2: lazy(() => import("../days/Daily02")),
};


// ---------- 資料 ----------
const daysData: Day[] = [
  {
    id: 1,
    title: "Day 1 - Cursor",
    tech: "Vanilla.js",
    thumb: "",
    component: Day01,
    content: "",
    description: ""
  },
  {
    id: 2,
    title: "Day 2 - 3D 產品展示",
    description: "使用 Three.js 製作的虛擬產品互動展示，可拖曳視角。",
    tech: "Three.js",
    thumb: "https://placehold.co/400x225/60A5FA/ffffff?text=Day+2",
    component: Day01,
    content:
      "專注於性能優化和材質渲染，讓用戶在不同設備上都能流暢地旋轉和縮放 3D 模型。",
  },
  {
    id: 3,
    title: "Day 3 - 微互動動畫",
    description: "用於點擊確認按鈕的流暢微動畫，提供即時視覺回饋。",
    tech: "Anime.js",
    thumb: "https://placehold.co/400x225/3B82F6/ffffff?text=Day+3",
    component: null,
    content:
      "使用 Anime.js 製作的彈跳和變形效果，在確認操作後給予用戶愉快的反饋，提升 UX。",
  },
  {
    id: 4,
    title: "Day 4 - 天氣儀表板",
    description:
      "響應式且資訊豐富的天氣預報儀表板，支援多城市查詢。",
    tech: "React, Tailwind",
    thumb: "https://placehold.co/400x225/1D4ED8/ffffff?text=Day+4",
    component: null,
    content:
      "設計考量了移動優先的佈局，並透過 Tailwind 實現快速響應式調整。",
  },
  {
    id: 5,
    title: "Day 5 - 音樂播放器 UI",
    description:
      "一個現代感的音樂播放器介面設計，具備歌詞同步功能。",
    tech: "CSS Grid",
    thumb: "https://placehold.co/400x225/3730A3/ffffff?text=Day+5",
    component: null,
    content:
      "設計風格追求極簡，透過 CSS Grid 確保專輯封面和控制按鈕的佈局清晰。",
  },
  // ...可繼續擴充
];


// ---------- 主應用（Hash Router 版本） ----------
const App = () => {

  const navigate = useNavigate();
  // 0 = gallery；非 0 則為 Day ID
  const [currentPageId, setCurrentPageId] = useState<number>(0);

  // 從 #day/1 解析出 id
  const parseHash = (): number => {
    const hash = window.location.hash.substring(1);
    const match = hash.match(/^day\/(\d+)$/);
    if (match) {
      const id = parseInt(match[1], 10);
      return daysData.find((d) => d.id === id) ? id : 0;
    }
    return 0;
  };

  useEffect(() => {
    const updatePageFromHash = () => setCurrentPageId(parseHash());
    updatePageFromHash(); // 初次載入
    window.addEventListener("hashchange", updatePageFromHash);
    return () => window.removeEventListener("hashchange", updatePageFromHash);
  }, []);

  const handleNavigate = (id: number) => {
    if (id === 0) {
      window.location.hash = "";
    } else {
      window.location.hash = `#day/${id}`;
    }
    setCurrentPageId(id);
    window.scrollTo(0, 0);
  };

  const currentDay = daysData.find((d) => d.id === currentPageId);


  // -------- Route 元件：Day 頁 --------
  function DayRoute({ days }: { days: Day[] }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const dayId = Number(id);
    const currentDay = days.find((d) => d.id === dayId);

    if (!currentDay) return <NotFound onBack={() => navigate("/")} />;

    return <DayContainer day={currentDay} onBack={() => navigate("/")} />;
  }

  // -------- 404 頁 --------
  function NotFound({ onBack }: { onBack: () => void }) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-red-100 bg-white py-20 text-red-400">
        <p className="text-xl font-medium">錯誤：找不到此作品 ID</p>
        <button
          onClick={onBack}
          className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md transition hover:bg-indigo-700"
        >
          返回作品集
        </button>
      </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        onNavigate={(id) => (id === 0 ? navigate("/") : navigate(`/day/${id}`))}
        total={daysData.length} />

      <main className="m-0 w-100vh">
        <Routes>
          {/* 首頁 → GalleryGrid */}
          <Route path="/" element={<GalleryGrid days={daysData} />} />

          {/* Day 頁 → 根據 :id 動態顯示 */}
          <Route path="/day/:id" element={<DayRoute days={daysData} />} />

          {/* 404 */}
          <Route path="*" element={<NotFound onBack={() => navigate("/")} />} />
        </Routes>
      </main>

      <footer className="mt-4 border-t border-gray-200 py-2 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Daily UI Challenge. Designed with Tailwind CSS.
      </footer>
    </div>
  );
};

export default App;