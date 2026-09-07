(function (global) {
    // Simula la configuración de "SLA, ACW y horario" del módulo Contact
    // Center de FrontAgyda (mismo shape: horarioInicio, horarioFin,
    // diasSemana con 1=Lunes..7=Domingo). Aquí no hay backend, así que se
    // guarda en localStorage para poder editarla desde Configuración.
    const STORAGE_KEY = 'postulacion_ayudantes_cc_config';

    const DEFAULT_CONFIG = {
        horarioInicio: '09:00',
        horarioFin: '18:00',
        diasSemana: '1,2,3,4,5',
        telefonoLlamada: '',
        whatsapp: '',
        facebook: '',
        instagram: '',
    };

    function getConfig() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        try {
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        } catch (e) {
            return { ...DEFAULT_CONFIG };
        }
    }

    function saveConfig(config) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...config }));
    }

    function isWithinBusinessHours(config, now) {
        const cfg = config || getConfig();
        const fecha = now || new Date();
        const dow = fecha.getDay() === 0 ? 7 : fecha.getDay(); // 1=Lun..7=Dom
        const dias = String(cfg.diasSemana || '').split(',').map(Number).filter(Boolean);
        if (!dias.includes(dow)) return false;

        const hhmm = fecha.toTimeString().slice(0, 5); // "HH:MM"
        return hhmm >= cfg.horarioInicio && hhmm <= cfg.horarioFin;
    }

    global.CCConfig = { getConfig, saveConfig, isWithinBusinessHours, DEFAULT_CONFIG };
})(window);
