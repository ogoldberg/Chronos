import type { Era } from '../types';

export const ERAS: Era[] = [
  { start: -14e9,    label: "Cosmic Dawn",       accent: "#9370db" },
  { start: -4.6e9,   label: "Earth Forms",        accent: "#ff8c00" },
  { start: -600e6,   label: "Life Diversifies",   accent: "#20b2aa" },
  { start: -66e6,    label: "Age of Mammals",     accent: "#cd853f" },
  { start: -12000,   label: "Civilization",        accent: "#daa520" },
  { start: -500,     label: "Classical World",     accent: "#dc143c" },
  { start: 500,      label: "Medieval",            accent: "#8b4513" },
  { start: 1500,     label: "Early Modern",        accent: "#3c78d8" },
  { start: 1800,     label: "Industrial Age",      accent: "#556b2f" },
  { start: 1950,     label: "Contemporary",        accent: "#00bfff" },
];

export function getEra(year: number): Era {
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (year >= ERAS[i].start) return ERAS[i];
  }
  return ERAS[0];
}
