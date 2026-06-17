const axios    = require("axios")
const FormData = require("form-data")
const { HttpsProxyAgent } = require("https-proxy-agent")

const OTP_ESTATICO = "753158"

const proxyAgent = process.env.PROXY_URL
  ? new HttpsProxyAgent(process.env.PROXY_URL)
  : undefined

async function authenticateOneshot(tenant) {
  const baseUrl  = tenant?.eclipsoft_oneshot_url || process.env.ONESHOT_BASE_URL || "https://eclipsoft.dev/oneshot"
  const username = tenant?.eclipsoft_user || process.env.ID4FACE_USER
  const password = tenant?.eclipsoft_pass || process.env.ID4FACE_PASS

  const response = await axios.post(
    `${baseUrl}/api/authenticate`,
    { username, password },
    { headers: { "Content-Type": "application/json" }, httpsAgent: proxyAgent }
  )
  const token = response.data?.id_token
  if (!token) throw new Error("No se obtuvo id_token de Oneshot.")
  console.log("Token Oneshot obtenido ✓")
  return { token, baseUrl }
}

/**
 * Flujo completo de firma electrónica Oneshot.
 * @param {Buffer} sumilladoBuffer
 * @param {Buffer} extraDocBuffer
 * @param {object} options — datos del firmante
 * @param {object} tenant  — datos del tenant
 */
async function firmarDocumento(sumilladoBuffer, extraDocBuffer, options = {}, tenant) {
  const { token, baseUrl } = await authenticateOneshot(tenant)
  const authHeader = { "Authorization": `Bearer ${token}` }

  // ── PASO 1: Crear solicitud ───────────────────────────────────────────
  console.log("=== ONESHOT PASO 1: /api/request ===")
  const reqForm = new FormData()
  reqForm.append("given_name",          options.given_name)
  reqForm.append("surname_1",           options.surname_1)
  reqForm.append("surname_2",           options.surname_2)
  reqForm.append("serial_number",       options.serial_number)
  reqForm.append("email",               options.email)
  reqForm.append("mobile_phone_number", options.mobile_phone_number)
  reqForm.append("residence_address",   options.residence_address  || "Guayaquil")
  reqForm.append("residence_city",      options.residence_city     || "Guayaquil")
  reqForm.append("residence_province",  options.residence_province || "Guayas")
  reqForm.append("residence",           "EC")
  reqForm.append("extra_document", extraDocBuffer, { filename: "evidencia_biometrica.pdf", contentType: "application/pdf" })

  const reqResponse = await axios.post(
    `${baseUrl}/api/request`, reqForm,
    { headers: { ...reqForm.getHeaders(), ...authHeader }, httpsAgent: proxyAgent, timeout: 35000 }
  )

  const signUuid = reqResponse.data?.detail
  if (!signUuid) throw new Error("No se obtuvo SIGN-UUID: " + JSON.stringify(reqResponse.data))
  console.log("SIGN-UUID obtenido:", signUuid)

  // ── PASO 2: Subir documento sumillado ─────────────────────────────────
  console.log("=== ONESHOT PASO 2: /api/upload-document ===")
  const uploadForm = new FormData()
  uploadForm.append("document", sumilladoBuffer, { filename: "documento_sumillado.pdf", contentType: "application/pdf" })

  const uploadResponse = await axios.post(
    `${baseUrl}/api/upload-document/${signUuid}`, uploadForm,
    { headers: { ...uploadForm.getHeaders(), ...authHeader }, httpsAgent: proxyAgent, timeout: 10000 }
  )

  let docId = uploadResponse.data?.detail
  if (Array.isArray(docId)) docId = docId[0]?.id
  if (!docId) throw new Error("No se obtuvo DOC_ID: " + JSON.stringify(uploadResponse.data))
  console.log("DOC_ID obtenido:", docId)

  // ── PASO 3: Generar OTP ───────────────────────────────────────────────
  console.log("=== ONESHOT PASO 3: /api/generate-otp ===")
  await axios.post(
    `${baseUrl}/api/generate-otp/${signUuid}`, null,
    { headers: authHeader, httpsAgent: proxyAgent, timeout: 10000 }
  )
  console.log("OTP generado ✓")

  // ── PASO 4: Firmar ────────────────────────────────────────────────────
  console.log("=== ONESHOT PASO 4: /api/sign ===")
  const signResponse = await axios.post(
    `${baseUrl}/api/sign/${signUuid}`,
    { otp: OTP_ESTATICO },
    { headers: { "Content-Type": "application/json", ...authHeader }, httpsAgent: proxyAgent, timeout: 65000 }
  )
  console.log("Firma response:", JSON.stringify(signResponse.data))

  // ── PASO 5: Obtener documento firmado ─────────────────────────────────
  console.log("=== ONESHOT PASO 5: /api/document signed ===")
  const docResponse = await axios.get(
    `${baseUrl}/api/document/${signUuid}/signed/${docId}`,
    { headers: authHeader, httpsAgent: proxyAgent, responseType: "arraybuffer", timeout: 15000 }
  )

  const signedPdfBuffer = Buffer.from(docResponse.data)
  console.log("Documento firmado obtenido ✓ size:", signedPdfBuffer.length, "bytes")

  return { signedPdfBuffer, signUuid, docId }
}

module.exports = { firmarDocumento }