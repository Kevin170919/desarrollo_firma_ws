const express = require("express")
const router = express.Router()
const { v4: uuid } = require("uuid")
const sessions = require("../utils/sessions")
const { generateToken } = require("../services/id4face.service")

const LOGO_BASE64 = "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"

// ─── Crear sesión y generar link biométrico ───────────────────────────────
router.post("/start-verification", async (req, res) => {
  try {
    const { cedula, dactilar } = req.body

    if (!cedula || !dactilar) {
      return res.status(400).json({
        success: false,
        message: "cedula y dactilar son requeridos"
      })
    }

    const token = await generateToken()
    const sessionId = uuid()

    sessions[sessionId] = {
      cedula,
      dactilar,
      token,
      createdAt: new Date()
    }

    const verificationUrl = `${process.env.SELF_URL}/verify/${sessionId}`

    return res.json({
      success: true,
      sessionId,
      url: verificationUrl
    })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─── Servir página HTML con componente id4face ───────────────────────────
router.get("/verify/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessions[sessionId]

    if (!session) {
      return res.status(404).send("Sesión no encontrada")
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validación Biométrica</title>
  <script src="https://id4face.eclipsoft.com/dist/id4face@2.4.0.js" defer></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      max-width: 500px;
      width: 100%;
      background: white;
      padding: 32px 24px;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      text-align: center;
    }
    h2 { color: #111827; margin-bottom: 8px; font-size: 1.4rem; }
    #status { color: #6b7280; font-size: 0.9rem; margin-bottom: 24px; }
    eclipsoft-id4face { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <img src="data:image/png;base64,${LOGO_BASE64}" style="width: 60px; margin-bottom: 16px;" alt="Logo" />
    <h2>Validación Biométrica</h2>
    <p id="status">Inicializando...</p>
    <eclipsoft-id4face dismissable oval limits></eclipsoft-id4face>
  </div>

  <script>
    const WHATSAPP_RETURN_URL = "https://wa.me/${process.env.WHATSAPP_NUMBER}"
    const LOGO_SRC = "data:image/png;base64,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"

    window.addEventListener("load", async () => {
      const id4face = document.querySelector("eclipsoft-id4face")
      const status = document.getElementById("status")

      id4face.token = "${session.token}"

      const config = {
        camera: "front",
        minMatch: "98",
        blink: true,
        env: "${process.env.ID4FACE_ENV || "dev"}",
        faceRecognition: true,
        callbackUrl: "${process.env.SELF_URL}/callback",
        checkId: {
          id: "${session.cedula}",
          dactilar: "${session.dactilar}"
        }
      }

      try {
        status.textContent = "Inicializando biometría..."
        await id4face.load(config)
        status.textContent = "Por favor mire a la cámara"

        try {
          await id4face.start()
        } catch (e) {
          console.warn("start() directo falló, esperando ready:", e)
        }

        id4face.addEventListener("ready", () => {
          status.textContent = "Por favor mire a la cámara"
          try { id4face.start() } catch (e) { console.error(e) }
        })

      } catch (error) {
        console.error(error)
        status.textContent = "Error iniciando biometría: " + error.message
      }

      id4face.addEventListener("result", async (event) => {
        status.textContent = "Procesando resultado..."
        try {
          const response = await fetch("${process.env.SELF_URL}/callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-callback-token": "${process.env.CALLBACK_TOKEN}"
            },
            body: JSON.stringify({
              sessionId: "${sessionId}",
              result: event.detail
            })
          })

          if (response.ok) {
            document.querySelector("eclipsoft-id4face").style.display = "none"
            document.querySelector(".container").innerHTML =
              '<img src="' + LOGO_SRC + '" style="width: 60px; margin-bottom: 16px;" alt="Logo" />' +
              '<div style="font-size: 3.5rem; margin-bottom: 12px">✅</div>' +
              '<h2 style="color: #f59e0b; margin-bottom: 12px">¡Validación exitosa!</h2>' +
              '<p style="color: #6b7280; margin-bottom: 24px; font-size: 0.95rem">Tu identidad ha sido verificada correctamente.</p>' +
              '<p style="color: #9ca3af; font-size: 0.85rem; margin-bottom: 20px">Regresando a WhatsApp en unos segundos...</p>' +
              '<a href="' + WHATSAPP_RETURN_URL + '" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 0.95rem;">Volver a WhatsApp</a>'
            setTimeout(() => {
              window.location.href = WHATSAPP_RETURN_URL
            }, 3000)
          } else {
            status.textContent = "Error procesando resultado."
          }
        } catch (err) {
          console.error(err)
          status.textContent = "Error enviando resultado."
        }
      })

      id4face.addEventListener("failed", (event) => {
        status.textContent = "❌ Validación fallida: " + (event.detail?.message || "intente de nuevo")
      })
    })
  </script>
</body>
</html>`

    res.send(html)
  } catch (error) {
    return res.status(500).send("Error interno: " + error.message)
  }
})

module.exports = router