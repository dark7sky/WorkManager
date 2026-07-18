// Shared drag-and-drop handlers for file attachment dropzones.
export const dropZoneHandlers = onFile => ({
  onDragOver: e => { e.preventDefault(); e.stopPropagation() },
  onDrop: e => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer?.files?.[0]
    if (file) onFile(file)
  },
})
