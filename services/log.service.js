const { query } = require("./db.service")

/**
 * Registra o actualiza el log de una sesión.
 * Si ya existe un log para esa sesión, lo actualiza.
 */
async function upsertLog(tenantId, sessionUuid, data = {}) {
  try {
    const existing = await query(
      "SELECT id FROM logs WHERE tenant_id = ? AND session_uuid = ?",
      [tenantId, sessionUuid]
    )

    if (existing.length) {
      // Actualizar log existente
      const fields = []
      const values = []

      const allowed = [
        "signer_name", "signer_cedula", "signer_email",
        "biometric_result", "similarity", "signed_doc_url",
        "sign_uuid", "step", "error_message", "ip_address", "duration_ms"
      ]

      for (const key of allowed) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`)
          values.push(data[key])
        }
      }

      if (fields.length) {
        values.push(tenantId, sessionUuid)
        await query(
          `UPDATE logs SET ${fields.join(", ")} WHERE tenant_id = ? AND session_uuid = ?`,
          values
        )
      }
    } else {
      // Crear nuevo log
      await query(
        `INSERT INTO logs
          (tenant_id, session_uuid, signer_name, signer_cedula, signer_email,
           biometric_result, similarity, signed_doc_url, sign_uuid,
           step, error_message, ip_address, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, sessionUuid,
          data.signer_name    || null,
          data.signer_cedula  || null,
          data.signer_email   || null,
          data.biometric_result || null,
          data.similarity     || null,
          data.signed_doc_url || null,
          data.sign_uuid      || null,
          data.step           || null,
          data.error_message  || null,
          data.ip_address     || null,
          data.duration_ms    || null
        ]
      )
    }
  } catch (error) {
    // No lanzar error para no interrumpir el flujo principal
    console.error("Error registrando log:", error.message)
  }
}

/**
 * Obtener logs de un tenant con paginación.
 */
async function getLogs(tenantId, { page = 1, limit = 20 } = {}) {
  const offset = (parseInt(page) - 1) * parseInt(limit)
  const logs = await query(
    `SELECT * FROM logs WHERE tenant_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [tenantId, parseInt(limit), offset]
  )
  const total = await query(
    "SELECT COUNT(*) as count FROM logs WHERE tenant_id = ?",
    [tenantId]
  )
  return { logs, total: total[0].count }
}

module.exports = { upsertLog, getLogs }