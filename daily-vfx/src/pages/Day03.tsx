// src/days/Daily03.tsx
import { useState, useEffect, useCallback } from "react";

// 擴展 Window 介面以包含 Tone
declare global {
  interface Window {
    Tone: any; // Tone.js instance, using 'any' due to dynamic loading and lack of official types
  }
}

// 將 PoC 重新命名為 DailyToneSynth
const Day03 = () => {
  // 使用 state 來儲存動態載入的 Tone 模組
  const [Tone, setTone] = useState<any | null>(null);

  // 您的 PoC 狀態
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [selectedNote, setSelectedNote] = useState('C');
  const [selectedOctave, setSelectedOctave] = useState(4);

  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octaves = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // 使用 Hex Codes (來自圖片的復古色系)，確保顏色能穩定顯示
  const synths = [
    { name: 'AMSynth', color: '#E9723F', icon: '〰️', shape: 'AM波形' }, // 復古橘
    { name: 'DuoSynth', color: '#1B4783', icon: '⚯', shape: '雙音' },   // 深藍
    { name: 'FMSynth', color: '#4CAF89', icon: '◈', shape: 'FM調變' },   // 復古綠
    { name: 'MembraneSynth', color: '#D99147', icon: '◐', shape: '鼓膜' }, // 焦橙
    { name: 'MetalSynth', color: '#C05A51', icon: '◇', shape: '金屬' },  // 復古紅
    { name: 'MonoSynth', color: '#2C7A7B', icon: '▬', shape: '單音' },   // 墨綠/青色
    { name: 'NoiseSynth', color: '#66A5AD', icon: '⚡', shape: '噪音' },  // 淺藍
    { name: 'PluckSynth', color: '#A5734A', icon: '♪', shape: '撥弦' },  // 土棕色
    { name: 'PolySynth', color: '#3A3F70', icon: '♫', shape: '複音' },  // 靛藍色
    { name: 'Synth', color: '#D44A3D', icon: '◆', shape: '基礎' }   // 深紅
  ];

  // 移除了 [isScriptLoaded] 狀態，它與 Tone 狀態重複。

  // 獲取當前選擇的音符
  const getCurrentNote = useCallback(() => `${selectedNote}${selectedOctave}`, [selectedNote, selectedOctave]);

  // 為和弦生成音符
  const getChordNotes = useCallback(() => {
    const rootIndex = notes.indexOf(selectedNote);
    const thirdIndex = (rootIndex + 4) % 12; // Major Third (大三度)
    const fifthIndex = (rootIndex + 7) % 12; // Perfect Fifth (純五度)

    return [
      `${selectedNote}${selectedOctave}`,
      `${notes[thirdIndex]}${selectedOctave}`,
      `${notes[fifthIndex]}${selectedOctave}`
    ];
  }, [selectedNote, selectedOctave, notes]);

  // 🚀 關鍵修正：修正 useEffect 的邏輯和依賴
  useEffect((): (() => void) => {
    const TONE_JS_CDN: string = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js';

    // 1. 腳本載入完成後的處理函式
    const scriptLoaded = (): void => {
      console.log("Tone.js 函式庫載入成功.");
      // 🚀 關鍵修正 A: 在腳本載入完成時，明確地將 window.Tone 賦值給 State
      if (window.Tone) {
        setTone(window.Tone); // 設定 State
        console.log("Tone.js State 設定完成，UI 即將更新.");
      }
    };

    // 2. 處理腳本載入邏輯
    const loadScript = (src: string): void => {
      // 檢查 DOM 中是否已經有該腳本標籤
      if (document.querySelector(`script[src="${src}"]`)) {
        console.log("Tone.js 腳本已存在 DOM 中.");
        // 如果腳本已存在，但因為某些原因 Tone 尚未在 State 中
        if (window.Tone) {
          setTone(window.Tone);
          return;
        }
      }

      // 如果腳本不存在，則建立並載入
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script: HTMLScriptElement = document.createElement('script');
        script.src = src;
        script.async = true;
        // 使用 addEventListener 處理 onload 和 onerror，更現代且乾淨
        script.addEventListener('load', scriptLoaded);
        script.addEventListener('error', () => console.error(`函式庫載入失敗: ${src}`));
        document.head.appendChild(script);
        console.log("Tone.js 腳本標籤已插入 DOM。");
      }
    };

    // 🚀 關鍵修正 B: 在 useEffect 執行時，先檢查全域變數是否已存在
    if (window.Tone) {
      setTone(window.Tone);
      console.log("Tone.js (全域) State 立即設定完成.");
    } else {
      // 如果不存在，則開始載入腳本
      loadScript(TONE_JS_CDN);
    }

    // 3. 離開時資源釋放 (Cleanup)
    return () => {
      // 確保 Tone 已載入且 Web Audio context 存在，再執行關閉
      if (window.Tone && window.Tone.context) {
        // 釋放 Web Audio API 資源，停止所有聲音
        window.Tone.context.close().then(() => {
          console.log("Tone.js context closed and resources released.");
        }).catch((err: any) => {
          console.error("Error closing Tone context:", err);
        });
      }

      // 清理動態插入的 <script> 標籤
      const script = document.querySelector(`script[src="${TONE_JS_CDN}"]`);
      if (script) {
        // 在移除前，確保移除事件監聽器以避免記憶體洩漏
        script.removeEventListener('load', scriptLoaded);
        script.remove();
        console.log("Tone.js script tag removed.");
      }
    };
  }, []); // 🚀 關鍵修正 C: 依賴項為 [] (空陣列)，確保只在元件掛載時執行一次載入邏輯。

  // 播放聲音的邏輯
  const playSound = useCallback(async (synthName: string) => {
    // 播放邏輯保持不變
    if (!Tone) {
      console.warn("Tone.js not yet loaded.");
      return;
    }

    const note = getCurrentNote();
    const chordNotes = getChordNotes();

    // 啟動 Web Audio Context
    if (!isStarted) {
      await Tone.start();
      setIsStarted(true);
    }

    setActiveButton(synthName);

    try {
      let synth: any;

      // 根據名稱創建並配置合成器
      switch (synthName) {
        case 'AMSynth':
          synth = new Tone.AMSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'DuoSynth':
          synth = new Tone.DuoSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'FMSynth':
          synth = new Tone.FMSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'MembraneSynth':
          synth = new Tone.MembraneSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'MetalSynth':
          synth = new Tone.MetalSynth().toDestination();
          synth.triggerAttackRelease('0.5');
          break;
        case 'MonoSynth':
          synth = new Tone.MonoSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'NoiseSynth':
          synth = new Tone.NoiseSynth().toDestination();
          synth.triggerAttackRelease('0.5');
          break;
        case 'PluckSynth':
          synth = new Tone.PluckSynth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
        case 'PolySynth':
          synth = new Tone.PolySynth().toDestination();
          synth.triggerAttackRelease(chordNotes, '0.5');
          break;
        case 'Synth':
          synth = new Tone.Synth().toDestination();
          synth.triggerAttackRelease(note, '0.5');
          break;
      }

      // 播放結束後，釋放單一合成器實例的資源
      setTimeout(() => {
        setActiveButton(null);
        if (synth) synth.dispose(); // 釋放單個 synth 資源
      }, 600);

    } catch (error) {
      console.error('Error playing sound:', error);
      setActiveButton(null);
    }
  }, [Tone, getCurrentNote, getChordNotes, isStarted]);

  // 如果 Tone 模組尚未載入，顯示載入中
  if (!Tone) {
    return (
      <div className="w-full max-w-7xl mx-auto p-8">
        <div className="text-center text-xl font-bold text-orange-600 p-10 bg-gray-100 rounded-xl">
          Loading Tone.js Library... 載入中 🎶
        </div>
      </div>
    );
  }

  // PoC 的 UI 部分 (使用 Tailwind)
  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-teal-50 p-8">
        <div className="max-w-6xl mx-auto">
          {/* ... (UI 保持不變) ... */}
          <h1 className="text-5xl font-bold text-orange-600 text-center mb-2">
             Tone.js Synth Dashboard 
          </h1>
          <p className="text-orange-700 text-center mb-8 text-lg font-medium">
            ✨ Click candy buttons to hear different synth sounds ✨
          </p>

          {/* Pitch Control Slider */}
          <div className="bg-gradient-to-br from-orange-100 to-amber-100 rounded-3xl p-8 mb-8 shadow-xl border-4 border-orange-300" style={{ boxShadow: '8px 8px 0px rgba(251, 146, 60, 0.3)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-orange-800">🎹 Pitch Control</h2>
              <span className="text-3xl font-bold text-white bg-gradient-to-r from-teal-400 to-sky-500 px-6 py-3 rounded-2xl shadow-lg border-3 border-teal-300" style={{ boxShadow: '4px 4px 0px rgba(45, 212, 191, 0.4)' }}>
                {getCurrentNote()}
              </span>
            </div>

            {/* Note Selection */}
            <div className="mb-6">
              <label className="text-orange-800 text-lg font-bold mb-3 block">🎵 Note</label>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                {notes.map((note) => (
                  <button
                    key={note}
                    onClick={() => setSelectedNote(note)}
                    className={`
                          ${selectedNote === note
                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white scale-110 border-orange-600'
                        : 'bg-gradient-to-br from-amber-200 to-orange-200 text-orange-800 hover:from-amber-300 hover:to-orange-300 border-orange-400'
                      }
                          font-bold py-3 px-2 rounded-xl
                          transition-all duration-200 transform
                          border-3 shadow-md
                        `}
                    style={{
                      boxShadow: selectedNote === note
                        ? '3px 3px 0px rgba(251, 146, 60, 0.4)'
                        : '2px 2px 0px rgba(251, 191, 36, 0.3)'
                    }}
                  >
                    {note}
                  </button>
                ))}
              </div>
            </div>

            {/* Octave Selection */}
            <div>
              <label className="text-orange-800 text-lg font-bold mb-3 block">🎚️ Octave</label>
              <div className="flex items-center space-x-4">
                <span className="text-orange-700 text-sm font-bold whitespace-nowrap">🔉</span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={selectedOctave}
                  onChange={(e) => setSelectedOctave(parseInt(e.target.value))}
                  className="flex-1 h-4 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #f97316 0%, #f97316 ${(selectedOctave / 8) * 100}%, #fef3c7 ${(selectedOctave / 8) * 100}%, #fef3c7 100%)`,
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                  }}
                />
                <span className="text-orange-700 text-sm font-bold whitespace-nowrap">🔊</span>
              </div>

              <div className="flex justify-between mt-3 text-orange-600 text-sm px-2 font-bold">
                {octaves.map(num => (
                  <span key={num} className={selectedOctave === num ? 'text-teal-500 font-black text-base' : ''}>
                    {num}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Synth Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {synths.map((synth) => (
              <button
                key={synth.name}
                onClick={() => playSound(synth.name)}
                disabled={activeButton === synth.name}
                className={`
        ${synth.color} 
        ${activeButton === synth.name
                    ? 'scale-95 opacity-90' // 點擊時下沉效果
                    : 'hover:scale-[1.02] hover:shadow-xl hover:brightness-110' // 一般 hover 效果
                  }
        text-white font-black py-6 px-6 rounded-3xl
        shadow-lg transition-all duration-150
        transform
        disabled:cursor-not-allowed
        flex flex-col items-center justify-center
        space-y-2
      `}
                style={{
                  // 🚀 使用內聯樣式設定背景色，解決 Tailwind v4 編譯問題
                  backgroundColor: synth.color,
                  // 保持陰影和文字陰影
                  boxShadow: '6px 6px 0px rgba(0, 0, 0, 0.15)',
                }}
              >
                <div className="text-6xl mb-1 drop-shadow-lg">
                  {synth.icon}
                </div>
                <div className="text-base font-black tracking-wide">{synth.name}</div>
                <div className="text-xs opacity-90 font-bold uppercase tracking-wider">{synth.shape}</div>
                {synth.name !== 'NoiseSynth' && synth.name !== 'MetalSynth' && (
                  <div className="text-xs font-bold mt-1 px-3 py-1 rounded-full backdrop-blur-sm">
                    {synth.name === 'PolySynth'
                      ? getChordNotes().join(' ')
                      : getCurrentNote()
                    }
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Day03;