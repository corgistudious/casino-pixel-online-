/** Cosmetic avatar frames sold for Cxu Vàng. They never affect gameplay or odds. */
export interface FrameItem {
  id: string;
  price: number;
  /** CSS conic-gradient stops rendered by the client. */
  colors: readonly string[];
  animated: boolean;
}

export const DEFAULT_FRAME = 'classic';

export const FRAMES: readonly FrameItem[] = [
  { id: 'classic', price: 0, colors: ['#fff1b8', '#b9801c', '#f7d77a', '#8a5a12'], animated: false },
  { id: 'silver', price: 5, colors: ['#ffffff', '#8d98b8', '#e4e9f5', '#4b5680'], animated: false },
  { id: 'emerald', price: 10, colors: ['#b8ffd6', '#1f9d61', '#7ff0a8', '#0b5e31'], animated: false },
  { id: 'ruby', price: 15, colors: ['#ffd1d8', '#d42a44', '#ff8a9a', '#7d1222'], animated: false },
  { id: 'sapphire', price: 20, colors: ['#d6f4ff', '#2f5ee8', '#5ad8ff', '#162f87'], animated: true },
  { id: 'royal', price: 40, colors: ['#fff1b8', '#b45cff', '#f2c14e', '#5ad8ff', '#ff4fd8'], animated: true },
];

export function findFrame(id: string): FrameItem | undefined {
  return FRAMES.find((f) => f.id === id);
}
