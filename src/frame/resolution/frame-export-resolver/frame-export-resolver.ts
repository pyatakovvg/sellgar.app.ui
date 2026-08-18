import { isFrameConstructor, type FrameConstructor } from '../../declaration/frame';

type FrameExportEntry = [string, FrameConstructor];

export const resolveFrameExport = (frameExports: Record<string, unknown>): FrameConstructor => {
  const candidates = Object.entries(frameExports).filter((entry): entry is FrameExportEntry =>
    isFrameConstructor(entry[1]),
  );

  if (candidates.length === 1) {
    return candidates[0][1];
  }

  const exportedNames = Object.keys(frameExports).join(', ') || '(empty)';

  if (candidates.length === 0) {
    throw new Error(`Экспорт frame не найден. Экспорты: ${exportedNames}.`);
  }

  throw new Error('Frame package должен экспортировать ровно один класс @Frame.');
};
