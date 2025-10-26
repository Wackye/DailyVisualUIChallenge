// src/types/day.ts

export type Day = {
  id: number;
  title: string;
  description: string;
  tech: string;
  thumb: string;
  component: React.ComponentType | null;
};