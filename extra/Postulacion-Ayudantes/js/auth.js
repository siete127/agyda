// Autenticación simulada — solo frontend, sin backend todavía.
// Guarda una bandera de sesión en localStorage para que BlackList pueda
// "protegerse" (redirige a login.html si no hay sesión). Cuando exista
// backend real, este módulo se reemplaza por llamadas a la API.
(function (global) {
    const STORAGE_KEY = 'postulacion_ayudantes_session';

    function login(usuario) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            usuario,
            loggedInAt: new Date().toISOString(),
        }));
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function isLoggedIn() {
        return !!localStorage.getItem(STORAGE_KEY);
    }

    function getSession() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }

    // Llamar al inicio de cualquier página protegida: si no hay sesión,
    // redirige a login.html de inmediato.
    function requireAuth() {
        if (!isLoggedIn()) {
            window.location.replace('login.html');
        }
    }

    global.PostulacionAuth = { login, logout, isLoggedIn, getSession, requireAuth };
})(window);
