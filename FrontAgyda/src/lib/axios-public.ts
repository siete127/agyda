import axios from 'axios'

// Instancia SIN el interceptor que inyecta Authorization/usuarioid/x-user-tipo.
// Se usa para páginas públicas (ej. encuestas públicas /encuesta/:slug) donde
// una sesión de intranet abierta en el mismo navegador no debe "contaminar"
// una respuesta que se supone anónima.
export const publicApi = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})
