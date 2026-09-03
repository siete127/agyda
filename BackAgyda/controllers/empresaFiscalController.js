const sql = require('mssql');
const forge = require('node-forge');
const databaseService = require('../services/databaseService');
const facturacionService = require('../services/facturacionService');

function esAdmin(req) {
  const tipo = String(req.user?.tipoUsuario || '').toUpperCase();
  return ['AD', 'TI'].includes(tipo);
}

async function ensureRow(pool) {
  await pool.request().query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.EMPRESA_FISCAL)
     INSERT INTO dbo.EMPRESA_FISCAL (EF_RFC) VALUES (NULL)`,
  );
}

// GET — datos fiscales + estado del CSD (nunca el .cer/.key/clave).
exports.getFiscal = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRow(pool);
    const r = await pool.request().query('SELECT TOP 1 * FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC');
    const row = r.recordset[0];
    return res.json({
      success: true,
      data: {
        rfc: row.EF_RFC || '',
        razonSocial: row.EF_RAZON_SOCIAL || '',
        regimenFiscal: row.EF_REGIMEN_FISCAL || '',
        cp: row.EF_CP || '',
        csdCargado: !!row.EF_CSD_CARGADO,
        csdNumCert: row.EF_CSD_NUM_CERT || null,
        csdVigenciaHasta: row.EF_CSD_VIGENCIA_HASTA || null,
      },
    });
  } catch (e) {
    console.error('getFiscal:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los datos fiscales' });
  }
};

// PUT — RFC / razón social / régimen / CP.
exports.updateFiscal = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const b = req.body || {};
    const rfc = String(b.rfc || '').trim().toUpperCase().slice(0, 13);
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
      return res.status(400).json({ success: false, message: 'El RFC no tiene un formato válido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRow(pool);
    await pool.request()
      .input('rfc', sql.NVarChar(13), rfc || null)
      .input('rs', sql.NVarChar(255), b.razonSocial ? String(b.razonSocial).slice(0, 255) : null)
      .input('reg', sql.NVarChar(3), b.regimenFiscal ? String(b.regimenFiscal).slice(0, 3) : null)
      .input('cp', sql.NVarChar(5), b.cp ? String(b.cp).slice(0, 5) : null)
      .query(`UPDATE dbo.EMPRESA_FISCAL SET
                EF_RFC=@rfc, EF_RAZON_SOCIAL=@rs, EF_REGIMEN_FISCAL=@reg, EF_CP=@cp,
                EF_FECHA_ACTUALIZACION=GETDATE()
              WHERE EF_ID=(SELECT TOP 1 EF_ID FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC)`);
    res.json({ success: true });
  } catch (e) {
    console.error('updateFiscal:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar los datos fiscales' });
  }
};

// Parsea el .cer (DER base64) y valida que la clave abra el .key.
function inspeccionarCSD(cerBase64, keyBase64, passwordCsd) {
  const cerDer = forge.util.decode64(cerBase64);
  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(cerDer));
  // La llave del SAT es PKCS#8 cifrada, en DER.
  const keyDer = forge.util.decode64(keyBase64);
  let privateKey;
  try {
    const asn1 = forge.asn1.fromDer(keyDer);
    privateKey = forge.pki.decryptPrivateKeyInfo(asn1, passwordCsd)
      || forge.pki.privateKeyFromAsn1(asn1);
  } catch (_) {
    privateKey = null;
  }
  if (!privateKey) {
    // segundo intento: PEM
    try {
      privateKey = forge.pki.decryptRsaPrivateKey(forge.pki.encryptedPrivateKeyToPem(forge.asn1.fromDer(keyDer)), passwordCsd);
    } catch (_) { /* ignore */ }
  }
  if (!privateKey) {
    const err = new Error('No se pudo abrir la llave privada con esa contraseña.');
    err.code = 'CSD_PASSWORD';
    throw err;
  }
  // RFC del certificado: está en el subject como x500UniqueIdentifier (2.5.4.45)
  // o en el campo "serialNumber". El SAT lo pone en 2.5.4.45.
  const attr = cert.subject.attributes.find((a) => a.type === '2.5.4.45' || a.name === 'x500UniqueIdentifier');
  const rfcCert = attr ? String(attr.value).split('/')[0].trim().toUpperCase() : null;
  return {
    rfc: rfcCert,
    numCert: cert.serialNumber ? Buffer.from(cert.serialNumber, 'hex').toString('ascii').replace(/[^0-9]/g, '') || cert.serialNumber : null,
    vigenciaHasta: cert.validity?.notAfter || null,
  };
}

// POST — carga el CSD (.cer + .key base64 + clave). Valida localmente y lo
// registra en el PAC si el proveedor lo requiere.
exports.subirCSD = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { cerBase64, keyBase64, passwordCsd } = req.body || {};
    if (!cerBase64 || !keyBase64 || !passwordCsd) {
      return res.status(400).json({ success: false, message: 'Faltan el certificado (.cer), la llave (.key) o la contraseña' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureRow(pool);
    const cur = await pool.request().query('SELECT TOP 1 EF_RFC rfc FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC');
    const rfcEmisor = (cur.recordset[0]?.rfc || '').toUpperCase();
    if (!rfcEmisor) {
      return res.status(400).json({ success: false, message: 'Primero guarda el RFC del emisor.' });
    }

    let info;
    try {
      info = inspeccionarCSD(cerBase64, keyBase64, passwordCsd);
    } catch (e) {
      if (e.code === 'CSD_PASSWORD') return res.status(400).json({ success: false, message: e.message });
      return res.status(400).json({ success: false, message: 'El certificado o la llave no son válidos.' });
    }

    if (info.rfc && info.rfc !== rfcEmisor) {
      return res.status(400).json({
        success: false,
        message: `El CSD pertenece al RFC ${info.rfc}, distinto al del emisor (${rfcEmisor}).`,
      });
    }

    // Registrar en el PAC (Facturama multiemisor). Si falla, no guardamos.
    const pac = await facturacionService.subirCSDAlPac(req.user?.empresa, {
      rfc: rfcEmisor, cerBase64, keyBase64, passwordCsd,
    });
    if (!pac.ok) {
      return res.status(400).json({ success: false, message: `No se pudo registrar el CSD en el PAC: ${pac.message}` });
    }

    await pool.request()
      .input('cer', sql.VarBinary(sql.MAX), Buffer.from(cerBase64, 'base64'))
      .input('key', sql.VarBinary(sql.MAX), Buffer.from(keyBase64, 'base64'))
      .input('pw', sql.NVarChar(200), String(passwordCsd))
      .input('num', sql.NVarChar(30), info.numCert || null)
      .input('vig', sql.DateTime, info.vigenciaHasta || null)
      .query(`UPDATE dbo.EMPRESA_FISCAL SET
                EF_CSD_CER=@cer, EF_CSD_KEY=@key, EF_CSD_PASSWORD=@pw,
                EF_CSD_NUM_CERT=@num, EF_CSD_VIGENCIA_HASTA=@vig, EF_CSD_CARGADO=1,
                EF_FECHA_ACTUALIZACION=GETDATE()
              WHERE EF_ID=(SELECT TOP 1 EF_ID FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC)`);

    res.json({ success: true, data: { numCert: info.numCert, vigenciaHasta: info.vigenciaHasta } });
  } catch (e) {
    console.error('subirCSD:', e.message);
    res.status(500).json({ success: false, message: 'Error al cargar el CSD' });
  }
};

exports.eliminarCSD = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().query(`UPDATE dbo.EMPRESA_FISCAL SET
        EF_CSD_CER=NULL, EF_CSD_KEY=NULL, EF_CSD_PASSWORD=NULL,
        EF_CSD_NUM_CERT=NULL, EF_CSD_VIGENCIA_HASTA=NULL, EF_CSD_CARGADO=0
      WHERE EF_ID=(SELECT TOP 1 EF_ID FROM dbo.EMPRESA_FISCAL ORDER BY EF_ID DESC)`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al quitar el CSD' });
  }
};
