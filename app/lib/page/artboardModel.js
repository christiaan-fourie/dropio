"use client";

const DEFAULT_ARTBOARD_UNIT = "mm";
const DEFAULT_ARTBOARD_BACKGROUND = "transparent";
const DEFAULT_ARTBOARD_WIDTH = 210;
const DEFAULT_ARTBOARD_HEIGHT = 297;
const DEFAULT_ARTBOARD_NAME = "Magic";
const DEFAULT_ARTBOARD_GAP_MM = 80;

export function makeArtboardId() {
  return `board_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function createDefaultArtboard(index = 0, position = { x: 0, y: 0 }) {
  return {
    id: makeArtboardId(),
    name: index === 0 ? DEFAULT_ARTBOARD_NAME : `Artboard ${index + 1}`,
    width: DEFAULT_ARTBOARD_WIDTH,
    height: DEFAULT_ARTBOARD_HEIGHT,
    unit: DEFAULT_ARTBOARD_UNIT,
    background: DEFAULT_ARTBOARD_BACKGROUND,
    x: position.x ?? index * (DEFAULT_ARTBOARD_WIDTH + DEFAULT_ARTBOARD_GAP_MM),
    y: position.y ?? 0,
  };
}

export function normalizeArtboard(raw, index = 0, position) {
  if (!raw) return createDefaultArtboard(index, position);
  return {
    id: raw.id || makeArtboardId(),
    name: raw.name || (index === 0 ? DEFAULT_ARTBOARD_NAME : `Artboard ${index + 1}`),
    width: Number(raw.width) || DEFAULT_ARTBOARD_WIDTH,
    height: Number(raw.height) || DEFAULT_ARTBOARD_HEIGHT,
    unit: raw.unit || DEFAULT_ARTBOARD_UNIT,
    background: raw.background || DEFAULT_ARTBOARD_BACKGROUND,
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : position?.x ?? index * (DEFAULT_ARTBOARD_WIDTH + DEFAULT_ARTBOARD_GAP_MM),
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : position?.y ?? 0,
  };
}

export function normalizeArtboards(rawArtboards, singleArtboard, count = 1) {
  if (Array.isArray(rawArtboards) && rawArtboards.length > 0) {
    return rawArtboards.map((board, index) => normalizeArtboard(board, index));
  }
  if (singleArtboard) {
    return [normalizeArtboard(singleArtboard, 0)];
  }
  return [createDefaultArtboard(0)];
}

export function ensureActiveArtboardId(activeArtboardId, artboards) {
  if (artboards.some((board) => board.id === activeArtboardId)) return activeArtboardId;
  return artboards[0]?.id ?? null;
}

export function normalizeElementArtboardIds(elements, artboards, fallbackId) {
  const defaultId = fallbackId ?? artboards[0]?.id ?? null;
  return (elements || []).map((el) => ({
    ...el,
    artboardId: el.artboardId || defaultId,
  }));
}

export function artboardBounds(artboards, padding = DEFAULT_ARTBOARD_GAP_MM) {
  const boards = artboards || [];
  if (boards.length === 0) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const board of boards) {
    minX = Math.min(minX, board.x);
    minY = Math.min(minY, board.y);
    maxX = Math.max(maxX, board.x + board.width);
    maxY = Math.max(maxY, board.y + board.height);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2,
  };
}

export function boardElements(elements, boardId) {
  return (elements || []).filter((el) => el.artboardId === boardId);
}

export function nextBoardPosition(artboards, width, gap = DEFAULT_ARTBOARD_GAP_MM) {
  if (!artboards?.length) return { x: 0, y: 0 };
  const maxX = Math.max(...artboards.map((board) => board.x + board.width));
  return { x: maxX + gap, y: artboards[0].y ?? 0 };
}
