const express = require("express")
const router = express.Router()
const { v4: uuid } = require("uuid")
const sessions = require("../utils/sessions")
const { generateToken } = require("../services/id4face.service")

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
    #warning {
      display: none;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.85rem;
      text-align: left;
    }
    #warning strong { display: block; margin-bottom: 6px; }
    #warning .url-box {
      background: #fff;
      padding: 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      word-break: break-all;
      margin-top: 8px;
      border: 1px solid #e5e7eb;
    }
    eclipsoft-id4face { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Validación Biométrica</h2>
    <p id="status">Inicializando...</p>
    <div id="warning">
      <strong>⚠️ Abre este link en tu navegador</strong>
      Para completar la validación necesitas abrir este link en Chrome o Safari:
      <div class="url-box" id="page-url"></div>
    </div>
    <eclipsoft-id4face dismissable oval limits></eclipsoft-id4face>
  </div>

  <script>
    const WHATSAPP_RETURN_URL = "https://wa.me/${process.env.WHATSAPP_NUMBER}"
    const currentUrl = window.location.href
    const ua = navigator.userAgent
    const isAndroid = /android/i.test(ua)
    const isIOS = /iphone|ipad/i.test(ua)
    const isWhatsApp = ua.includes("WhatsApp")

    // ── Intentar forzar apertura en navegador nativo ──────────────────────
    if (isWhatsApp) {
      if (isAndroid) {
        // Intent para abrir en Chrome — si falla cae al navegador por defecto
        const intent = "intent://" + currentUrl.replace(/^https?:\\/\\//, "") +
          "#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;end"
        window.location.replace(intent)
      } else if (isIOS) {
        // En iOS WhatsApp no permite forzar navegador externo directamente
        // Mostrar aviso con la URL para que el usuario la copie
        document.getElementById("warning").style.display = "block"
        document.getElementById("page-url").textContent = currentUrl
        document.getElementById("status").textContent = "Abre el link en Safari para continuar."
      }
    }

    // ── Iniciar biometría ─────────────────────────────────────────────────
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

        // Solo registrar ready y timeout si load() fue exitoso
        const readyTimeout = setTimeout(() => {
          status.textContent = "Iniciando (modo fallback)..."
          try { id4face.start() } catch (e) { console.error(e) }
        }, 10000)

        id4face.addEventListener("ready", () => {
          clearTimeout(readyTimeout)
          status.textContent = "Por favor mire a la cámara"
          try {
            id4face.start()
          } catch (error) {
            status.textContent = "Error iniciando cámara: " + error.message
          }
        })

      } catch (error) {
        console.error(error)
        status.textContent = "Error iniciando biometría: " + error.message
      }

      // ── Resultado exitoso → notificar backend → redirigir a WhatsApp ───
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
            status.textContent = "✅ Validación completada. Regresando a WhatsApp..."
            // Esperar 1.5s para que el usuario vea el mensaje y redirigir
            setTimeout(() => {
              window.location.href = WHATSAPP_RETURN_URL
            }, 1500)
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
