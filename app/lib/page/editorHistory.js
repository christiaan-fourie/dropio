export const MAX_UNDO_HISTORY = 50;

export function cloneEditorDocument({ elements, artboards, activeArtboardId, selectedIds }) {
  return {
    elements: (elements || []).map((el) => ({ ...el })),
    artboards: (artboards || []).map((board) => ({ ...board })),
    activeArtboardId,
    selectedIds: [...(selectedIds || [])],
  };
}

export function sanitizeSelection(selectedIds, elements) {
  const ids = new Set((elements || []).map((el) => el.id));
  return (selectedIds || []).filter((id) => ids.has(id));
}
