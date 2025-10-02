// src/components/Header.tsx
import { useLocation, useNavigate } from "react-router-dom";

type HeaderProps = {
  onNavigate: (id: number) => void;
  total: number;
  showShare?: boolean;   // 可選，DayContainer 才用
};

function Header({ onNavigate, total, showShare }: HeaderProps) {

  const location = useLocation();
  const navigate = useNavigate();
  const isDayRoute = location.pathname.startsWith("/day/");


  return (
    <header className="border-b border-gray-200 py-4">
      <nav className="flex items-center justify-center relative">
        {/* 左側：返回 */}
        {isDayRoute ? (
          <button
            onClick={() => navigate("/")}
            className="absolute left-0 ml-2 flex items-center rounded-lg p-2 font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800"
          >
            ← 返回
          </button>
        ) : <span />}

        {/* 中間：標題 */}
        <h2
          className="cursor-pointer text-xl font-bold text-gray-900 transition hover:text-indigo-600"
          onClick={() => onNavigate(0)}
        >
          Daily UI Challenge Portfolio
        </h2>
      </nav>
    </header>
  );
}

export default Header;
