// src/types/day.ts
import type { ComponentType } from "react";

export type Day = {
  id: number;
  title: string;
  description: string;
  tech: string;
  thumb: string;
  component: React.ComponentType | null;
  content: string;
};