const https = require('https');

const API_KEY  = process.env.FOOTBALL_DATA_API_KEY || '8cce574322b94d57abdb95d45a5fcc82';
const API_HOST = 'api.football-data.org';
// ID de competición: 2000 = FIFA World Cup
const COMP_ID  = 2000;

// Caché en memoria: evita superar el límite de 10 req/min del free tier
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 60_000; // 60 segundos

// Mapeo de status de la API → etiqueta visible
function labelEstado(status, minute) {
  switch (status) {
    case 'IN_PLAY':   return minute ? `EN VIVO ${minute}'` : 'EN VIVO';
    case 'PAUSED':    return 'MEDIO TIEMPO';
    case 'FINISHED':  return 'FT';
    case 'TIMED':
    case 'SCHEDULED': return null; // se calcula por fecha
    case 'POSTPONED': return 'POSPUESTO';
    case 'CANCELLED': return 'CANCELADO';
    case 'SUSPENDED': return 'SUSPENDIDO';
    default:          return status;
  }
}

// Banderas por código ISO-3 → emoji (los más comunes del Mundial 2026)
const FLAGS = {
  MEX:'🇲🇽', USA:'🇺🇸', CAN:'🇨🇦', ARG:'🇦🇷', BRA:'🇧🇷', ESP:'🇪🇸',
  FRA:'🇫🇷', GER:'🇩🇪', POR:'🇵🇹', NED:'🇳🇱', ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', ITA:'🇮🇹',
  URU:'🇺🇾', COL:'🇨🇴', CHI:'🇨🇱', ECU:'🇪🇨', PER:'🇵🇪', PAR:'🇵🇾',
  BOL:'🇧🇴', VEN:'🇻🇪', CRI:'🇨🇷', HON:'🇭🇳', PAN:'🇵🇦', JAM:'🇯🇲',
  JPN:'🇯🇵', KOR:'🇰🇷', SAU:'🇸🇦', IRN:'🇮🇷', AUS:'🇦🇺', NZL:'🇳🇿',
  MAR:'🇲🇦', SEN:'🇸🇳', NGA:'🇳🇬', CMR:'🇨🇲', EGY:'🇪🇬', GHA:'🇬🇭',
  CIV:'🇨🇮', TUN:'🇹🇳', DZA:'🇩🇿', ZAF:'🇿🇦', BEL:'🇧🇪', CHE:'🇨🇭',
  CRO:'🇭🇷', DEN:'🇩🇰', POL:'🇵🇱', CZE:'🇨🇿', SVK:'🇸🇰', SRB:'🇷🇸',
  AUT:'🇦🇹', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', UKR:'🇺🇦', TUR:'🇹🇷', GRE:'🇬🇷', SVN:'🇸🇮',
  ALB:'🇦🇱', HUN:'🇭🇺', ROU:'🇷🇴', BIH:'🇧🇦', MNE:'🇲🇪', GEO:'🇬🇪',
  QAT:'🇶🇦', IRQ:'🇮🇶', UZB:'🇺🇿', IDN:'🇮🇩', THA:'🇹🇭', IND:'🇮🇳',
  CHN:'🇨🇳', CUW:'🇨🇼', NOR:'🇳🇴', HAI:'🇭🇹', SWE:'🇸🇪', CGO:'🇨🇩',
  JOR:'🇯🇴', SUI:'🇨🇭', ALG:'🇩🇿', COD:'🇨🇩',
};

// Nombres en español
const NOMBRES_ES = {
  'Mexico':'México', 'Brazil':'Brasil', 'Germany':'Alemania', 'France':'Francia',
  'Netherlands':'Holanda', 'England':'Inglaterra', 'Scotland':'Escocia',
  'Korea Republic':'Corea del Sur', 'Saudi Arabia':'Arabia Saudita',
  'Iran':'Irán', 'New Zealand':'Nueva Zelanda', 'Australia':'Australia',
  'Japan':'Japón', 'Morocco':'Marruecos', 'Senegal':'Senegal',
  'Nigeria':'Nigeria', 'Cameroon':'Camerún', 'Egypt':'Egipto',
  'Ghana':'Ghana', 'Ivory Coast':'Costa de Marfil', 'Tunisia':'Túnez',
  'Algeria':'Argelia', "South Africa":'Sudáfrica', 'Belgium':'Bélgica',
  'Switzerland':'Suiza', 'Croatia':'Croacia', 'Denmark':'Dinamarca',
  'Poland':'Polonia', 'Czechia':'Rep. Checa', 'Slovakia':'Eslovaquia',
  'Serbia':'Serbia', 'Austria':'Austria', 'Ukraine':'Ucrania',
  'Turkey':'Turquía', 'Greece':'Grecia', 'Slovenia':'Eslovenia',
  'Albania':'Albania', 'Hungary':'Hungría', 'Romania':'Rumanía',
  'Bosnia-H.':'Bosnia', 'Montenegro':'Montenegro', 'Georgia':'Georgia',
  'Qatar':'Catar', 'Iraq':'Irak', 'Uzbekistan':'Uzbekistán',
  'Norway':'Noruega', 'Haiti':'Haití', 'Sweden':'Suecia',
  'Congo DR':'Congo RD', 'Jordan':'Jordania', 'Panama':'Panamá',
  'Curaçao':'Curaçao', 'Paraguay':'Paraguay', 'Ecuador':'Ecuador',
  'Colombia':'Colombia', 'Uruguay':'Uruguay', 'Peru':'Perú',
  'Bolivia':'Bolivia', 'Venezuela':'Venezuela', 'Costa Rica':'Costa Rica',
  'Honduras':'Honduras', 'Jamaica':'Jamaica', 'USA':'EUA',
  'Canada':'Canadá', 'Argentina':'Argentina', 'Portugal':'Portugal',
  'Spain':'España', 'Italy':'Italia', 'Scotland':'Escocia',
};

function flag(cca3) {
  return FLAGS[cca3] || '🏳️';
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path,
      method: 'GET',
      headers: { 'X-Auth-Token': API_KEY },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function fetchPartidos() {
  // Traer partidos de hoy ±3 días para mostrar contexto
  const now   = new Date();
  const from  = new Date(now); from.setDate(from.getDate() - 1);
  const to    = new Date(now); to.setDate(to.getDate() + 3);
  const fmt   = (d) => d.toISOString().slice(0, 10);

  const url = `/v4/competitions/${COMP_ID}/matches?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`;
  const { status, body } = await apiGet(url);

  if (status !== 200) {
    throw new Error(`football-data.org responded ${status}: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const today = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 86_400_000));

  return (body.matches || []).map((m) => {
    const matchDate = m.utcDate ? m.utcDate.slice(0, 10) : '';
    const hora = m.utcDate
      ? new Date(m.utcDate).toLocaleTimeString('es-MX', {
          hour: '2-digit', minute: '2-digit',
          timeZone: 'America/Mexico_City',
        })
      : '--:--';

    const apiStatus = m.status || 'SCHEDULED';
    const minute    = m.minute || null;
    let estado = labelEstado(apiStatus, minute);

    if (!estado) {
      if (matchDate === today)    estado = 'HOY';
      else if (matchDate === tomorrow) estado = 'MAÑANA';
      else {
        const d = new Date(matchDate + 'T12:00:00');
        estado = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).toUpperCase();
      }
    }

    const homeTeam = m.homeTeam || {};
    const awayTeam = m.awayTeam || {};
    const score    = m.score   || {};
    const full     = score.fullTime  || {};
    const half     = score.halfTime  || {};

    const golesLocal    = full.home  != null ? full.home  : (half.home  != null ? half.home  : null);
    const golesVisitante = full.away != null ? full.away  : (half.away != null ? half.away  : null);

    return {
      id:              m.id,
      local:           flag(homeTeam.tla || ''),
      localNombre:     NOMBRES_ES[homeTeam.shortName] || NOMBRES_ES[homeTeam.name] || homeTeam.shortName || homeTeam.name || '?',
      visitante:       flag(awayTeam.tla || ''),
      visitanteNombre: NOMBRES_ES[awayTeam.shortName] || NOMBRES_ES[awayTeam.name] || awayTeam.shortName || awayTeam.name || '?',
      hora,
      estado,
      apiStatus,
      minuto:          minute,
      golesLocal,
      golesVisitante,
      sede:            m.venue || '',
      esInaugural:     false,
      fecha:           matchDate,
    };
  });
}

exports.getPartidos = async (req, res) => {
  try {
    const now = Date.now();
    if (_cache && (now - _cacheAt) < CACHE_TTL) {
      return res.json({ success: true, partidos: _cache, cached: true, updatedAt: new Date(_cacheAt).toISOString() });
    }

    const partidos = await fetchPartidos();
    _cache  = partidos;
    _cacheAt = now;

    return res.json({ success: true, partidos, cached: false, updatedAt: new Date(_cacheAt).toISOString() });
  } catch (err) {
    const logger = global.logger || console;
    logger.error('[mundial] Error fetching partidos:', err.message);

    // Si hay caché vieja, mejor devolverla que un error
    if (_cache) {
      return res.json({ success: true, partidos: _cache, cached: true, stale: true, updatedAt: new Date(_cacheAt).toISOString() });
    }
    return res.status(502).json({ success: false, message: err.message });
  }
};
