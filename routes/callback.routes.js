const express = require("express")
const router  = express.Router()
const { query }     = require("../services/db.service")
const { evaluateBiometric } = require("../utils/biometricDecision.service")
const { fetchExtraDocumentByCedula } = require("../services/extraDocument.service")
const { upsertLog } = require("../services/log.service")

const CALLBACK_TOKEN = process.env.CALLBACK_TOKEN

router.post("/callback", async (req, res) => {
  try {
    const tokenHeader = req.get("x-callback-token")

    if (!CALLBACK_TOKEN || tokenHeader !== CALLBACK_TOKEN) {
      return res.status(401).json({ success: false, message: "No autorizado" })
    }

    const { sessionId, result } = req.body
    const sessions = req.app.locals.sessions || {}
    const session  = sessions[sessionId]

    if (!session) {
      return res.status(404).json({ success: false, message: "Sesión no encontrada" })
    }

    session.result     = result
    session.evaluation = evaluateBiometric(result)
    session.finishedAt = new Date()

    console.log(`Callback recibido — sessionId: ${sessionId} — decision: ${session.evaluation.decision}`)

    // Log resultado biométrico
    await upsertLog(session.tenantId, sessionId, {
      biometric_result: session.evaluation.decision,
      similarity:       session.evaluation.similarity || null,
      step:             session.evaluation.decision === "APPROVED" ? "BIOMETRIC_APPROVED" : "BIOMETRIC_REJECTED"
    })

    // Actualizar estado en MySQL
    await query(
      "UPDATE sessions SET status = ? WHERE session_uuid = ? AND tenant_id = ?",
      [session.evaluation.decision, sessionId, session.tenantId]
    )

    // Si aprobado obtener extraDocument
    if (session.evaluation.decision === "APPROVED") {
      try {
        console.log("Obteniendo extraDocument para cédula:", session.cedula)
        await upsertLog(session.tenantId, sessionId, { step: "FETCHING_EXTRA_DOCUMENT" })

        const extraDocumentBuffer = await fetchExtraDocumentByCedula(session.cedula, session.tenantData)
        session.extraDocument = {
          id:        session.cedula,
          buffer:    extraDocumentBuffer,
          fetchedAt: new Date()
        }
        console.log("extraDocument obtenido ✓ size:", extraDocumentBuffer.length, "bytes")

        await upsertLog(session.tenantId, sessionId, { step: "EXTRA_DOCUMENT_READY" })
      } catch (error) {
        console.error("Error obteniendo extraDocument:", error.message)
        session.extraDocument = { id: session.cedula, error: error.message }
        await upsertLog(session.tenantId, sessionId, {
          step:          "EXTRA_DOCUMENT_ERROR",
          error_message: error.message
        })
      }
    }

    return res.json({ success: true })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router