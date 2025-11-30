// Simple vector distance 2D
export const distance = (x1: number, y1: number, x2: number, y2: number) => {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

// Map a value from one range to another
export const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

// Linear interpolation
export const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};