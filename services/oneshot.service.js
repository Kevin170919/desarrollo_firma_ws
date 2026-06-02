const axios   = require("axios")
const FormData = require("form-data")

const ONESHOT_BASE_URL = "https://eclipsoft.dev/oneshot"
const OTP_ESTATICO     = "753158"

async function authenticateOneshot() {
  const response = await axios.post(
    `${ONESHOT_BASE_URL}/api/authenticate`,
    {
      username: process.env.ID4FACE_USER,
      password: process.env.ID4FACE_PASS
    },
    { headers: { "Content-Type": "application/json" } }
  )
  const token = response.data?.id_token
  if (!token) throw new Error("No se obtuvo id_token de Oneshot.")
  console.log("Token Oneshot obtenido ✓")
  return token
}

/**
 * Flujo completo de firma electrónica Oneshot.
 * @param {Buffer} sumilladoBuffer  - PDF sumillado por PDF Builder
 * @param {Buffer} extraDocBuffer   - PDF de evidencia biométrica
 * @param {object} options
 * @param {string} options.given_name
 * @param {string} options.surname_1
 * @param {string} options.surname_2
 * @param {string} options.serial_number
 * @param {string} options.email
 * @param {string} options.mobile_phone_number
 * @returns {{ signedPdfBuffer: Buffer, signedPdfUrl: string, signUuid: string, docId: string }}
 */
async function firmarDocumento(sumilladoBuffer, extraDocBuffer, options = {}) {
  const token = await authenticateOneshot()

  const authHeader = { "Authorization": `Bearer ${token}` }

  // ── PASO 1: Crear solicitud de firma ──────────────────────────────────
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
  reqForm.append("extra_document", extraDocBuffer, {
    filename: "evidencia_biometrica.pdf",
    contentType: "application/pdf"
  })

  const reqResponse = await axios.post(
    `${ONESHOT_BASE_URL}/api/request`,
    reqForm,
    {
      headers: { ...reqForm.getHeaders(), ...authHeader },
      timeout: 35000
    }
  )

  const signUuid = reqResponse.data?.detail
  if (!signUuid) throw new Error("No se obtuvo SIGN-UUID de /api/request: " + JSON.stringify(reqResponse.data))
  console.log("SIGN-UUID obtenido:", signUuid)

  // ── PASO 2: Subir documento sumillado ─────────────────────────────────
  console.log("=== ONESHOT PASO 2: /api/upload-document ===")
  const uploadForm = new FormData()
  uploadForm.append("document", sumilladoBuffer, {
    filename: "Certificado_Chat_Sessions_sumillado.pdf",
    contentType: "application/pdf"
  })

  const uploadResponse = await axios.post(
    `${ONESHOT_BASE_URL}/api/upload-document/${signUuid}`,
    uploadForm,
    {
      headers: { ...uploadForm.getHeaders(), ...authHeader },
      timeout: 10000
    }
  )

  // El DOC_ID puede venir como string o dentro de un array según la doc
  let docId = uploadResponse.data?.detail
  if (Array.isArray(docId)) docId = docId[0]?.id
  if (!docId) throw new Error("No se obtuvo DOC_ID de /api/upload-document: " + JSON.stringify(uploadResponse.data))
  console.log("DOC_ID obtenido:", docId)

  // ── PASO 3: Generar OTP ───────────────────────────────────────────────
  console.log("=== ONESHOT PASO 3: /api/generate-otp ===")
  await axios.post(
    `${ONESHOT_BASE_URL}/api/generate-otp/${signUuid}`,
    null,
    { headers: authHeader, timeout: 10000 }
  )
  console.log("OTP generado ✓")

  // ── PASO 4: Firmar documento ──────────────────────────────────────────
  console.log("=== ONESHOT PASO 4: /api/sign ===")
  const signResponse = await axios.post(
    `${ONESHOT_BASE_URL}/api/sign/${signUuid}`,
    { otp: OTP_ESTATICO },
    {
      headers: {
        "Content-Type": "application/json",
        ...authHeader
      },
      timeout: 65000
    }
  )
  console.log("Firma response:", JSON.stringify(signResponse.data))

  // ── PASO 5: Obtener documento firmado ─────────────────────────────────
  console.log("=== ONESHOT PASO 5: /api/document signed ===")
  const docResponse = await axios.get(
    `${ONESHOT_BASE_URL}/api/document/${signUuid}/signed/${docId}`,
    {
      headers: authHeader,
      responseType: "arraybuffer",
      timeout: 15000
    }
  )

  const signedPdfBuffer = Buffer.from(docResponse.data)
  console.log("Documento firmado obtenido ✓ size:", signedPdfBuffer.length, "bytes")

  return { signedPdfBuffer, signUuid, docId }
}

module.exports = { firmarDocumento }