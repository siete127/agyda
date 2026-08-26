// Document Picture-in-Picture API (Chrome/Edge 116+). No incluida en los tipos
// DOM estándar de TypeScript todavía — se declara mínimamente lo que usamos.
// https://developer.chrome.com/docs/web-platform/document-picture-in-picture

interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

interface DocumentPictureInPictureEvent extends Event {
  window: Window
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow: (options?: DocumentPictureInPictureOptions) => Promise<Window>
  readonly window: Window | null
  onenter: ((this: DocumentPictureInPicture, ev: DocumentPictureInPictureEvent) => unknown) | null
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture
}
