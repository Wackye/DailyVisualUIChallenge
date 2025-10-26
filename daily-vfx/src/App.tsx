import { useEffect, useState } from "react";
import { lazy } from "react";
import "./index.css";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";


import { daysData } from "./Data/Daysdata";
import type { Day } from "./Data/day";
import Header from "./components/Header";
import DayContainer from "./components/DayContainer";
import GalleryGrid from "./components/GalleryGrid";




export const dayModules = {
  1: lazy(() => import("./pages/Day01")), // ← 這裡指向 Daily01.tsx
  // 2: lazy(() => import("../days/Daily02")),
};


// ---------- 主應用（Hash Router 版本） ----------
const App = () => {

  const navigate = useNavigate();
  // 0 = gallery；非 0 則為 Day ID
  const [, setCurrentPageId] = useState<number>(0);

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