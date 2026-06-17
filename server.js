require("dotenv").config()
const path    = require("path")
const express = require("express")
const cors    = require("cors")
const { testConnection } = require("./services/db.service")

const verificationRoutes = require("./routes/verification.routes")
const callbackRoutes     = require("./routes/callback.routes")
const requestRoutes      = require("./routes/request.routes")
const authRoutes         = require("./routes/auth.routes")
const adminRoutes        = require("./routes/admin.routes")

const app = express()

app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true }))

// Sesiones en memoria (se reinician con cada deploy)
app.locals.sessions = {}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:    "ok",
    service:   "bimetria-platform",
    timestamp: new Date().toISOString()
  })
})

// ── Documentos firmados — servir por tenant ───────────────────────────────────
app.use("/signed", express.static(path.join(__dirname, "signed")))

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use(authRoutes)
app.use(adminRoutes)
app.use(verificationRoutes)
app.use(callbackRoutes)
app.use(requestRoutes)

// ── Verificar IP del proxy ────────────────────────────────────────────────────
app.get("/my-ip", async (req, res) => {
  try {
    const { HttpsProxyAgent } = require("https-proxy-agent")
    const axios = require("axios")
    const agent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined
    console.log("PROXY_URL configurado:", process.env.PROXY_URL || "NO CONFIGURADO")
    const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: agent })
    console.log("IP obtenida:", response.data.ip)
    res.json({ ip: response.data.ip, usando_proxy: !!agent })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`Servidor iniciado en puerto ${PORT}`)
  console.log("=== ENV VARS ===")
  console.log("SELF_URL:",             process.env.SELF_URL)
  console.log("EXTRA_DOCUMENT_BASE_URL:", process.env.EXTRA_DOCUMENT_BASE_URL)
  console.log("ID4FACE_AUTH_URL:",     process.env.ID4FACE_AUTH_URL)
  console.log("ONESHOT_BASE_URL:",     process.env.ONESHOT_BASE_URL)
  console.log("PDF_BUILDER_BASE_URL:", process.env.PDF_BUILDER_BASE_URL)
  console.log("PROXY_URL configurado:", !!process.env.PROXY_URL)
  console.log("MySQL HOST:",           process.env.MYSQL_HOST)

  // Conectar MySQL al iniciar
  await testConnection()
})