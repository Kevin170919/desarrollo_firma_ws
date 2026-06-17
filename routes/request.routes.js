const express  = require("express")
const router   = express.Router()
const fs       = require("fs")
const path     = require("path")
const { query }    = require("../services/db.service")
const authMiddleware = require("../middleware/auth.middleware")
const { fetchExtraDocumentByCedula } = require("../services/extraDocument.service")
const { generateSumilladoDocument }  = require("../services/pdfBuilder.service")
const { firmarDocumento }            = require("../services/oneshot.service")
const { upsertLog }                  = require("../services/log.service")

// ─── GET /result/:sessionId ───────────────────────────────────────────────────
router.get("/result/:sessionId", authMiddleware, async (req, res) => {
  const sessions = req.app.locals.sessions || {}
  const session  = sessions[req.params.sessionId]

  if (!session || session.tenantId !== req.tenant.id) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  return res.json({
    success:    true,
    sessionId:  req.params.sessionId,
    cedula:     session.cedula,
    decision:   session.evaluation?.decision   || null,
    similarity: session.evaluation?.similarity || null,
    message:    session.evaluation?.message    || null,
    finishedAt: session.finishedAt             || null,
    biometrics: session.result                 || null
  })
})

// ─── GET /session-status/:sessionId ──────────────────────────────────────────
router.get("/session-status/:sessionId", authMiddleware, async (req, res) => {
  const sessions = req.app.locals.sessions || {}
  const session  = sessions[req.params.sessionId]

  if (!session || session.tenantId !== req.tenant.id) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  const buffer = session.extraDocument?.buffer

  return res.json({
    success:   true,
    sessionId: req.params.sessionId,
    cedula:    session.cedula,
    decision:  session.evaluation?.decision || null,
    extraDocument: {
      exists:    !!buffer,
      sizeBytes: buffer?.length || 0,
      isPDF:     buffer ? buffer.slice(0, 4).toString() === "%PDF" : false,
      fetchedAt: session.extraDocument?.fetchedAt || null,
      error:     session.extraDocument?.error     || null
    }
  })
})

// ─── GET /logs — Logs del tenant autenticado ──────────────────────────────────
router.get("/logs", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const logs = await query(
      "SELECT * FROM logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [req.tenant.id, parseInt(limit), offset]
    )
    const total = await query(
      "SELECT COUNT(*) as count FROM logs WHERE tenant_id = ?",
      [req.tenant.id]
    )

    return res.json({
      success: true,
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: total[0].count }
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ─── POST /onboarding-request/:sessionId ─────────────────────────────────────
router.post("/onboarding-request/:sessionId", authMiddleware, async (req, res) => {
  const startTime = Date.now()
  const { sessionId } = req.params
  const sessions = req.app.locals.sessions || {}
  const session  = sessions[sessionId]

  try {
    if (!session || session.tenantId !== req.tenant.id) {
      return res.status(404).json({ success: false, message: "Sesión no encontrada" })
    }

    if (!session.evaluation || session.evaluation.decision !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "La sesión no está aprobada. Decision: " + (session.evaluation?.decision || "pendiente")
      })
    }

    const required = ["given_name", "surname_1", "surname_2", "nui", "email", "phoneNumber", "clientName", "wordToFind"]
    for (const field of required) {
      if (!req.body[field]) {
        return res.status(400).json({ success: false, message: `Campo requerido: ${field}` })
      }
    }

    // Log — inicio del proceso de firma
    await upsertLog(req.tenant.id, sessionId, {
      signer_name:  `${req.body.given_name} ${req.body.surname_1} ${req.body.surname_2}`,
      signer_email: req.body.email,
      step:         "SIGNING_START",
      ip_address:   req.ip
    })

    const tenantData = session.tenantData

    // ── Obtener PDF del tenant desde MySQL ────────────────────────────────
    const docRows = await query(
      "SELECT file_data, filename FROM tenant_documents WHERE tenant_id = ? ORDER BY uploaded_at DESC LIMIT 1",
      [req.tenant.id]
    )

    if (!docRows.length) {
      return res.status(400).json({ success: false, message: "El tenant no tiene documento configurado. Contacta al administrador." })
    }

    const pdfBuffer = docRows[0].file_data
    const filename  = docRows[0].filename

    // ── Evidencia biométrica ──────────────────────────────────────────────
    let evidenceBuffer = session.extraDocument?.buffer
    if (!evidenceBuffer) {
      console.log("Obteniendo extraDocument...")
      await upsertLog(req.tenant.id, sessionId, { step: "FETCHING_EXTRA_DOCUMENT" })
      evidenceBuffer = await fetchExtraDocumentByCedula(session.cedula, tenantData)
      session.extraDocument = { id: session.cedula, buffer: evidenceBuffer, fetchedAt: new Date() }
    }

    // ── PASO 1: Generar sumillado ─────────────────────────────────────────
    console.log("=== GENERANDO SUMILLADO ===")
    await upsertLog(req.tenant.id, sessionId, { step: "PDF_BUILDER" })

    const sumilladoBuffer = await generateSumilladoDocument(
      pdfBuffer, filename,
      {
        name:       `${req.body.given_name} ${req.body.surname_1}`,
        nui:        req.body.nui,
        clientName: req.body.clientName,
        wordToFind: req.body.wordToFind
      },
      tenantData
    )

    // ── PASO 2: Firmar con Oneshot ────────────────────────────────────────
    console.log("=== GENERANDO FIRMA ONESHOT ===")
    await upsertLog(req.tenant.id, sessionId, { step: "ONESHOT_SIGNING" })

    const { signedPdfBuffer, signUuid, docId } = await firmarDocumento(
      sumilladoBuffer,
      evidenceBuffer,
      {
        given_name:          req.body.given_name,
        surname_1:           req.body.surname_1,
        surname_2:           req.body.surname_2,
        serial_number:       req.body.nui,
        email:               req.body.email,
        mobile_phone_number: req.body.phoneNumber,
        residence_address:   req.body.residence_address  || "Guayaquil",
        residence_city:      req.body.residence_city     || "Guayaquil",
        residence_province:  req.body.residence_province || "Guayas"
      },
      tenantData
    )

    // ── Guardar PDF firmado por tenant ────────────────────────────────────
    const outputDir = path.join(__dirname, `../signed/${req.tenant.id}`)
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    const outputFilename = `firmado_${session.cedula}_${Date.now()}.pdf`
    const outputPath     = path.join(outputDir, outputFilename)
    fs.writeFileSync(outputPath, signedPdfBuffer)

    const signedPdfUrl = `${process.env.SELF_URL}/signed/${req.tenant.id}/${outputFilename}`
    const duration_ms  = Date.now() - startTime

    // Guardar en sesión
    session.signedDocument = { filename: outputFilename, url: signedPdfUrl, signUuid, docId, signedAt: new Date() }

    // Log final — éxito
    await upsertLog(req.tenant.id, sessionId, {
      signed_doc_url:   signedPdfUrl,
      sign_uuid:        signUuid,
      step:             "COMPLETED",
      error_message:    null,
      duration_ms
    })

    // Actualizar estado sesión en MySQL
    await query(
      "UPDATE sessions SET status = 'APPROVED' WHERE session_uuid = ? AND tenant_id = ?",
      [sessionId, req.tenant.id]
    )

    return res.json({
      success:      true,
      sessionId,
      signUuid,
      signedPdfUrl
    })

  } catch (error) {
    console.error("Error en onboarding-request:", error.message)

    // Log de error
    await upsertLog(req.tenant.id, sessionId, {
      step:          "ERROR",
      error_message: error.message,
      duration_ms:   Date.now() - startTime
    })

    if (error.response) {
      console.error("HTTP Status:", error.response.status)
      console.error("Response data:", JSON.stringify(error.response.data))
    }
    return res.status(500).json({
      success: false,
      message: error.message,
      detail:  error.response?.data || null
    })
  }
})

module.exports = router