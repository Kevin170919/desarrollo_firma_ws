require("dotenv").config()
const path = require("path")
const express = require("express")
const cors = require("cors")

const verificationRoutes = require("./routes/verification.routes")
const callbackRoutes = require("./routes/callback.routes")
const requestRoutes = require("./routes/request.routes")

const app = express()

app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "id4face-bimetria",
    timestamp: new Date().toISOString()
  })
})

app.use("/signed", express.static(path.join(__dirname, "signed")))
app.use(verificationRoutes)
app.use(callbackRoutes)
app.use(requestRoutes)

app.get("/my-ip", async (req, res) => {
  try {
    const { HttpsProxyAgent } = require("https-proxy-agent")
    const axios = require("axios")
    const agent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined
    const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: agent })
    res.json(response.data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`)
  console.log("=== ENV VARS ===")
  console.log("SELF_URL:", process.env.SELF_URL)
  console.log("BASE_URL:", process.env.BASE_URL)
  console.log("EXTRA_DOCUMENT_BASE_URL:", process.env.EXTRA_DOCUMENT_BASE_URL)
  console.log("REQUEST_INFORMATION_BASE_URL:", process.env.REQUEST_INFORMATION_BASE_URL)
  console.log("ID4FACE_AUTH_URL:", process.env.ID4FACE_AUTH_URL)
  console.log("ID4FACE_ENV:", process.env.ID4FACE_ENV)
})

