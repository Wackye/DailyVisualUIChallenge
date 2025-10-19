// src/data/daysData.ts
import type { Day } from "./day"; // 根據實際路徑調整
import Day01 from "../pages/Day01";
import Day02 from "../pages/Day02";
import Day03 from "../pages/Day03";
import Day04 from "../pages/Day04";
import Day05 from "../pages/Day05";
import Day06 from "../pages/Day06";
export const daysData: Day[] = [
  {
    id: 1,
    title: "Day 1 - Cursor",
    tech: "Vanilla.js",
    thumb: "/preview/Day01.png",
    component: Day01,
    description: "The first trial for practicing canvas interaction.",
  },
  {
    id: 2,
    title: "Day 2 - Music blocks",
    description: "A Trial for integrating p5.js & tone.js",
    tech: "Tone.js",
    thumb: "/preview/Day02.png",
    component: Day02,
  },
  {
    id: 3,
    title: "Day 3",
    description: "Palette for all the tone.js synthesizer",
    tech: "Tone.js",
    thumb: "/preview/Day03.png",
    component: Day03,
  },
  {
    id: 4,
    title: "Day 4 - Gesture Detection",
    description: "test for media pipe API. gesture detection.",
    tech: "mediapipe",
    thumb: "/preview/Day04.png",
    component: Day04,
  },
  {
    id: 5,
    title: "Day 5 - Web Theremin",
    description: "a Camera-based Thermin",
    tech: "Tone.js, Meidapipe",
    thumb: "/preview/Day05.png",
    component: Day05,
  },
  {
    id: 6,
    title: "Day 6 - Money is coming my way",
    description: "A simple yet powerful face tracking experiment.",
    tech: "Tone.js, Meidapipe",
    thumb: "",
    component: Day06,
  },

];
