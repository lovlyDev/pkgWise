import type { ScoreCategory } from '../public/ClientResults.js';

export const scoreCategories: readonly ScoreCategory[] = [
  'security',
  'maintenance',
  'supply-chain',
  'reliability',
  'compatibility',
  'quality',
];

export const defaultCategoryWeights: Readonly<Record<ScoreCategory, number>> = {
  security: 0.3,
  maintenance: 0.2,
  'supply-chain': 0.15,
  reliability: 0.15,
  compatibility: 0.1,
  quality: 0.1,
};
