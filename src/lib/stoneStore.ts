import { writable } from 'svelte/store';

export type StoneType = {
  id: string;
  type: string;
  baseSize: number;    // 저장 또는 불러올 때 기준이 되는 돌 크기
  name: string;
  totalElapsed?: number;
};

function getRandomStoneType() {
  const stoneTypes = [
    'andesite',
    'basalt',
    'conglomerate',
    'gneiss',
    'granite',
    'limestone',
    'quartzite',
    'sandstone',
    'shale',
    'tuff'
  ];
  return stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
}

const defaultStone: StoneType = {
  id: crypto.randomUUID(),
  type: getRandomStoneType(),
  baseSize: 1,
  name: 'My Stone',
  totalElapsed: 0
};

export const currentStone = writable<StoneType>(defaultStone);
