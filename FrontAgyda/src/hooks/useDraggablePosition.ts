import { useState, useRef, useCallback, useEffect } from 'react'

interface Pos { x: number; y: number }

const DRAG_THRESHOLD = 5 // px mínimos para considerar que es un drag y no un click

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function loadPos(key: string, defaultPos: Pos): Pos {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultPos
    const parsed = JSON.parse(raw) as Pos
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch { /* ignorar */ }
  return defaultPos
}

export function useDraggablePosition(key: string, defaultPos: Pos) {
  const [pos, setPos] = useState<Pos>(() => loadPos(key, defaultPos))
  const dragging = useRef(false)
  const moved = useRef(false)          // ¿se movió más del umbral?
  const startMouse = useRef<Pos>({ x: 0, y: 0 })
  const startPos = useRef<Pos>({ x: 0, y: 0 })

  const save = useCallback((p: Pos) => {
    try { localStorage.setItem(key, JSON.stringify(p)) } catch { /* ignorar */ }
  }, [key])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - startMouse.current.x
    const dy = e.clientY - startMouse.current.y
    if (!moved.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    moved.current = true
    const newPos: Pos = {
      x: clamp(startPos.current.x + dx, 0, window.innerWidth - 60),
      y: clamp(startPos.current.y + dy, 0, window.innerHeight - 60),
    }
    setPos(newPos)
  }, [])

  const onMouseUp = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.userSelect = ''
    if (!moved.current) return   // fue un click normal, no guardar ni mover
    const dx = e.clientX - startMouse.current.x
    const dy = e.clientY - startMouse.current.y
    const finalPos: Pos = {
      x: clamp(startPos.current.x + dx, 0, window.innerWidth - 60),
      y: clamp(startPos.current.y + dy, 0, window.innerHeight - 60),
    }
    setPos(finalPos)
    save(finalPos)
  }, [save])

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    moved.current = false
    startMouse.current = { x: e.clientX, y: e.clientY }
    startPos.current = pos
    document.body.style.userSelect = 'none'
  }, [pos])

  // Fase de captura: intercepta ANTES de que el click llegue a cualquier hijo
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      e.preventDefault()
      e.stopPropagation()
      moved.current = false
    }
  }, [])

  return {
    pos,
    dragProps: {
      onMouseDown,
      onClickCapture,
      style: { cursor: 'grab' } as React.CSSProperties,
    },
  }
}
