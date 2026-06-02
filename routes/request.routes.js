const express  = require("express")
const router   = express.Router()
const sessions = require("../utils/sessions")
const fs       = require("fs")
const path     = require("path")
const { fetchExtraDocumentByCedula }   = require("../services/extraDocument.service")
const { generateSumilladoDocument }    = require("../services/pdfBuilder.service")
const { firmarDocumento }              = require("../services/oneshot.service")

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resultado biométrico
// GET /result/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/result/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId]

  if (!session) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  return res.json({
    success: true,
    sessionId: req.params.sessionId,
    cedula: session.cedula,
    decision: session.evaluation?.decision       || null,
    similarity: session.evaluation?.similarity   || null,
    message: session.evaluation?.message         || null,
    finishedAt: session.finishedAt               || null,
    biometrics: session.result                   || null
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Estado del extraDocument
// GET /session-status/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session-status/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId]

  if (!session) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  const buffer = session.extraDocument?.buffer

  return res.json({
    success: true,
    sessionId: req.params.sessionId,
    cedula: session.cedula,
    decision: session.evaluation?.decision || null,
    extraDocument: {
      exists: !!buffer,
      sizeBytes: buffer?.length || 0,
      isPDF: buffer ? buffer.slice(0, 4).toString() === "%PDF" : false,
      fetchedAt: session.extraDocument?.fetchedAt || null,
      error: session.extraDocument?.error || null
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Generar firma — flujo completo automático

router.post("/onboarding-request/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessions[sessionId]

    if (!session) {
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

    // ── Evidencia biométrica (extraDocument) ─────────────────────────────
    let evidenceBuffer = session.extraDocument?.buffer
    if (!evidenceBuffer) {
      console.log("Obteniendo extraDocument...")
      evidenceBuffer = await fetchExtraDocumentByCedula(session.cedula)
      session.extraDocument = { id: session.cedula, buffer: evidenceBuffer, fetchedAt: new Date() }
    }

    // ── PASO 1: Generar sumillado con PDF Builder ─────────────────────────
    console.log("=== GENERANDO SUMILLADO ===")
    const sumilladoBuffer = await generateSumilladoDocument({
      name:        req.body.given_name + " " + req.body.surname_1,
      nui:         req.body.nui,
      clientName:  req.body.clientName,
      wordToFind:  req.body.wordToFind
    })

    // ── PASO 2: Firmar con Oneshot ────────────────────────────────────────
    console.log("=== GENERANDO FIRMA ONESHOT ===")
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
      }
    )

    // ── Guardar documento firmado en disco (vía física) ───────────────────
    const outputDir      = path.join(__dirname, "../signed")
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)
    const outputFilename = `firmado_${session.cedula}_${Date.now()}.pdf`
    const outputPath     = path.join(outputDir, outputFilename)
    fs.writeFileSync(outputPath, signedPdfBuffer)
    console.log("Documento firmado guardado:", outputFilename)

    // ── URL pública del documento firmado ─────────────────────────────────
    const signedPdfUrl = `${process.env.SELF_URL}/signed/${outputFilename}`

    // Guardar en sesión
    session.signedDocument = { filename: outputFilename, url: signedPdfUrl, signUuid, docId, signedAt: new Date() }

    return res.json({
      success: true,
      sessionId,
      signUuid,
      signedPdfUrl,      // ← URL pública para abrir/descargar el PDF
      signedFilename: outputFilename
    })

  } catch (error) {
    console.error("Error en onboarding-request:", error.message)
    if (error.response) {
      console.error("HTTP Status:", error.response.status)
      console.error("Response data:", JSON.stringify(error.response.data))
    }
    return res.status(500).json({
      success: false,
      message: error.message,
      detail: error.response?.data || null
    })
  }
})

module.exports = router
