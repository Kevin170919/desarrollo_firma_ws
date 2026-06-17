const axios    = require("axios")
const FormData = require("form-data")
const { HttpsProxyAgent } = require("https-proxy-agent")

const proxyAgent = process.env.PROXY_URL
  ? new HttpsProxyAgent(process.env.PROXY_URL)
  : undefined

/**
 * Autentica en PDF Builder usando credenciales del tenant.
 */
async function authenticatePdfBuilder(tenant) {
  const baseUrl  = tenant?.eclipsoft_pdf_builder_url || process.env.PDF_BUILDER_BASE_URL || "https://eclipsoft.dev/pdf-builder"
  const username = tenant?.eclipsoft_user || process.env.ID4FACE_USER
  const password = tenant?.eclipsoft_pass || process.env.ID4FACE_PASS

  const response = await axios.post(
    `${baseUrl}/api/authenticate`,
    { username, password },
    { headers: { "Content-Type": "application/json" }, httpsAgent: proxyAgent }
  )
  const token = response.data?.id_token
  if (!token) throw new Error("No se obtuvo id_token de PDF Builder.")
  console.log("Token PDF Builder obtenido ✓")
  return { token, baseUrl }
}

/**
 * Genera el documento sumillado usando PDF Builder.
 * @param {Buffer} fileBuffer   - PDF del tenant desde la BD
 * @param {string} filename     - nombre del archivo
 * @param {object} options      - name, nui, clientName, wordToFind
 * @param {object} tenant       - datos del tenant
 */
async function generateSumilladoDocument(fileBuffer, filename, options = {}, tenant) {
  const { name, nui, clientName, wordToFind } = options

  if (!name || !nui || !clientName || !wordToFind) {
    throw new Error("Faltan campos requeridos: name, nui, clientName, wordToFind")
  }

  if (!fileBuffer) throw new Error("PDF del tenant no disponible.")

  const { token, baseUrl } = await authenticatePdfBuilder(tenant)

  const form = new FormData()
  form.append("file",       fileBuffer, { filename: filename || "documento.pdf", contentType: "application/pdf" })
  form.append("name",       name)
  form.append("nui",        nui)
  form.append("clientName", clientName)
  form.append("wordToFind", wordToFind)

  console.log("=== PDF BUILDER: generando sumillado ===")
  console.log("name:", name, "| nui:", nui, "| wordToFind:", wordToFind)

  const response = await axios.post(
    `${baseUrl}/api/edit-word`, form,
    {
      headers:      { ...form.getHeaders(), "Authorization": `Bearer ${token}` },
      httpsAgent:   proxyAgent,
      responseType: "arraybuffer",
      timeout:      30000
    }
  )

  console.log("PDF Builder response status:", response.status)
  console.log("PDF sumillado size (bytes):", response.data?.length)

  return Buffer.from(response.data)
}

module.exports = { generateSumilladoDocument }