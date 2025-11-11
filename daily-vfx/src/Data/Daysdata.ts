// src/data/daysData.ts
import type { Day } from "./day"; // 根據實際路徑調整
import Day01 from "../pages/Day01";
import Day02 from "../pages/Day02";
import Day03 from "../pages/Day03";
import Day04 from "../pages/Day04";
import Day05 from "../pages/Day05";
import Day06 from "../pages/Day06";
import Day07 from "../pages/Day07";
import Day08 from "../pages/Day08";
import Day09 from "../pages/Day09";
import Day10 from "../pages/Day10";
import Day11 from "../pages/Day11";
import Day12 from "../pages/Day12";
import Day13 from "../pages/Day13";
import Day14 from "../pages/Day14";
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
    title: "Day 6 - Earn your own bitcoin",
    description: "Catch the coins with your mouth.",
    tech: "Meidapipe",
    thumb: "/preview/Day06.png",
    component: Day06,
  },
  {
    id: 7,
    title: "Day 7 - Glyphs",
    description: "use gesture to draw primitives.",
    tech: "Meidapipe",
    thumb: "/preview/Day07.png",
    component: Day07,
  },
  {
    id: 8,
    title: "Day 8 - Collage Picture of Taipei",
    description: "The impression of Taipei — in motion, in layers, in collage.",
    tech: "Midjourney, ChatGPT, Nano banana.",
    thumb: "/preview/Day08.png",
    component: Day08,
  },
  {
    id: 9,
    title: "Day 9 - DustFall",
    description: "A still scene collapses into particles",
    tech: "PixiJS",
    thumb: "./preview/Day09.png",
    component: Day09,
  },
  {
    id: 10,
    title: "Day 10 - Maginifier",
    description: "GLSL shader practice.",
    tech: "REGL",
    thumb: "./preview/Day10.png",
    component: Day10,
  },
  {
    id: 11,
    title: "Day 11 - Cursor interaction",
    description: "GSAP cursor practice",
    tech: "GSAP",
    thumb: "./preview/Day11.png",
    component: Day11,
  },
  {
    id: 12,
    title: "Day 12 - Cursor interaction",
    description: "GSAP cursor practice",
    tech: "GSAP",
    thumb: "./preview/Day12.png",
    component: Day12,
  },
  {
    id: 13,
    title: "Day 13 - Cursor interaction",
    description: "GSAP cursor practice",
    tech: "GSAP",
    thumb: "./preview/Day13.png",
    component: Day13,
  },
    {
    id: 14,
    title: "Day 14 - 2.5D gesture",
    description: "",
    tech: "Mediapipe",
    thumb: "./preview/Day14.png",
    component: Day14,
  },
];
