const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

exports.uploadNoticiaImage = async (req, res) => {
  try {
    const { base64, filename } = req.body || {};
    if (!base64 || !filename) {
      return res.status(400).json({ success: false, message: 'base64 y filename son requeridos' });
    }

    // Obtener solo el nombre base del archivo y sanitizar
    const originalName = path.basename(String(filename).replace(/\\/g, '/'));
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const iisRoot = 'C:/inetpub/wwwroot/intranet/intranet';
    const noticiasFolder = path.join(iisRoot, 'Noticias');
     // Usar la ruta con nombre tal cual viene del cliente (ya es única del lado del cliente)
     // Si hay conflicto de nombre, agregar sufijo con timestamp
     let filePath = path.join(noticiasFolder, safeName);
     let finalSafeName = safeName;
     let counter = 0;
   
     // Si el archivo ya existe, agregar un sufijo numérico
     while (fs.existsSync(filePath)) {
       counter++;
       const parts = safeName.split('.');
       const ext = parts.pop();
       const nameWithoutExt = parts.join('.');
       finalSafeName = `${nameWithoutExt}_${counter}.${ext}`;
       filePath = path.join(noticiasFolder, finalSafeName);
     }

    // Extraer solo la parte base64 si viene en dataURL
    const commaIdx = base64.indexOf(',');
    const dataPart = commaIdx >= 0 ? base64.substring(commaIdx + 1) : base64;
    const buffer = Buffer.from(dataPart, 'base64');

    // Asegurar directorio
    if (!fs.existsSync(noticiasFolder)) {
      fs.mkdirSync(noticiasFolder, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `https://intranet.ardabytec.vip/intranet/Noticias/${finalSafeName}`;
    console.log('🖼️ Imagen guardada en:', filePath, 'URL:', publicUrl);
    return res.json({ success: true, url: publicUrl });
  } catch (e) {
    console.error('Error subiendo imagen:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.uploadVacanteCV = async (req, res) => {
  try {
    const { base64, filename } = req.body || {};
    if (!base64 || !filename) {
      return res.status(400).json({ success: false, message: 'base64 y filename son requeridos' });
    }

    const originalName = path.basename(String(filename).replace(/\\/g, '/'));
    if (!/\.pdf$/i.test(originalName)) {
      return res.status(400).json({ success: false, message: 'Solo se permiten archivos PDF' });
    }
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const commaIdx = base64.indexOf(',');
    const dataPart = commaIdx >= 0 ? base64.substring(commaIdx + 1) : base64;
    const buffer = Buffer.from(dataPart, 'base64');

    const MAX_BYTES = 5 * 1024 * 1024; // 5MB, igual al límite anunciado en el formulario
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ success: false, message: 'El archivo excede el tamaño máximo de 5MB' });
    }

    const cvFolder = path.join(__dirname, '..', 'public', 'uploads', 'vacantes-cv');
    if (!fs.existsSync(cvFolder)) {
      fs.mkdirSync(cvFolder, { recursive: true });
    }

    const finalName = `${Date.now()}_${safeName}`;
    const filePath = path.join(cvFolder, finalName);
    fs.writeFileSync(filePath, buffer);

    const base = (process.env.BASE_PUBLIC_URL || '').replace(/\/$/, '');
    const publicUrl = base
      ? `${base}/uploads/vacantes-cv/${finalName}`
      : `/uploads/vacantes-cv/${finalName}`;

    console.log('📄 CV de vacante guardado en:', filePath, 'URL:', publicUrl);
    return res.status(200).json({ success: true, url: publicUrl });
  } catch (e) {
    console.error('Error subiendo CV de vacante:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.proxyPDF = async (req, res) => {
  try {
    const target = req.query.u;
    if (!target || typeof target !== 'string') {
      return res.status(400).send('Missing url');
    }
    
    let urlObj;
    try {
      urlObj = new URL(target);
    } catch (e) {
      return res.status(400).send('Invalid url');
    }
    
    console.log('📄 PDF proxy ->', target);

    // 1) Fallback local: si es el IIS interno con ruta conocida, servir desde filesystem
    try {
      const hostname = (urlObj.hostname || '').toLowerCase();
      const port = urlObj.port || (urlObj.protocol === 'http:' ? '80' : '443');
      const pathnameDecoded = decodeURIComponent(urlObj.pathname || '/');
      
      // Mapeo: https://intranet.ardabytec.vip/intranet/... -> C:\inetpub\wwwroot\intranet\intranet\...
      if (hostname === 'intranet.ardabytec.vip' && port === '443' && pathnameDecoded.startsWith('/intranet/')) {
        const baseDir = 'C:\\inetpub\\wwwroot\\intranet\\';
        const relativePath = pathnameDecoded.replace(/^\//, ''); // quitar '/' inicial
        const fullPath = path.normalize(path.join(baseDir, relativePath));
        
        if (!fullPath.startsWith(path.normalize(baseDir))) {
          return res.status(403).send('Forbidden');
        }
        
        // Validar existencia y servir
        if (fs.existsSync(fullPath)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Frame-Options', '');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"');
          
          const stream = fs.createReadStream(fullPath);
          stream.on('error', (err) => {
            console.error('❌ File stream error:', err.message);
            if (!res.headersSent) res.status(500).send('File stream error');
          });
          
          return stream.pipe(res);
        } else {
          console.warn('⚠️ Archivo no encontrado en filesystem:', fullPath);
          // continúa al proxy aguas arriba
        }
      }
    } catch (localErr) {
      console.warn('⚠️ Fallback local falló, intentando proxy aguas arriba:', localErr.message);
    }
    
    const isHttp = urlObj.protocol === 'http:';
    const client = isHttp ? http : https;

    // Agente HTTPS que permite certificados auto-firmados/chain incompleta
    const agent = isHttp ? undefined : new https.Agent({
      rejectUnauthorized: false,
      servername: urlObj.hostname,
    });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttp ? 80 : 443),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/pdf,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IntranetProxy/1.0',
        'Host': urlObj.host,
        'Connection': 'close',
      },
      agent,
    };

    const upstream = client.request(options, (upstreamRes) => {
      if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
        console.error('❌ PDF proxy upstream status:', upstreamRes.statusCode);
        res.status(upstreamRes.statusCode).end();
        upstreamRes.resume();
        return;
      }
      
      // Forzar cabeceras amigables para iframe PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', '');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"');
      
      upstreamRes.pipe(res);
    });

    upstream.on('error', (err) => {
      console.error('PDF proxy error:', err && err.stack ? err.stack : err.message || err);
      res.status(502).send('Proxy error');
    });

    upstream.setTimeout(20000, () => {
      upstream.destroy(new Error('Upstream timeout'));
    });

    upstream.end();
  } catch (err) {
    console.error('Error en /proxy/pdf:', err);
    res.status(500).send('Internal proxy error');
  }
};