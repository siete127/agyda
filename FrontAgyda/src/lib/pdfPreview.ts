import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Renderiza la primera página de un PDF a un data URL de imagen (PNG), para
// la vista previa tipo WhatsApp antes de enviar y en el visor del chat.
// `fuente` puede ser un File (aún no subido) o una URL (ya subido).
export async function renderizarPrimeraPaginaPdf(fuente: File | string): Promise<{ dataUrl: string; totalPaginas: number } | null> {
  try {
    const data = typeof fuente === 'string' ? fuente : await fuente.arrayBuffer()
    const pdf = await pdfjsLib.getDocument(typeof data === 'string' ? { url: data } : { data }).promise
    const pagina = await pdf.getPage(1)
    const viewport = pagina.getViewport({ scale: 1.5 })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await pagina.render({ canvasContext: ctx, viewport, canvas }).promise
    return { dataUrl: canvas.toDataURL('image/png'), totalPaginas: pdf.numPages }
  } catch {
    return null
  }
}
