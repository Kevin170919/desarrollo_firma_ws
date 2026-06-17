const axios = require("axios")
const { HttpsProxyAgent } = require("https-proxy-agent")

const proxyAgent = process.env.PROXY_URL
  ? new HttpsProxyAgent(process.env.PROXY_URL)
  : undefined

/**
 * Genera un token de sesión autenticándose en ID4FACE.
 * @param {object} tenant — datos del tenant con credenciales Eclipsoft
 */
async function generateToken(tenant) {
  try {
    const authUrl = tenant?.eclipsoft_id4face_url
      ? `${tenant.eclipsoft_id4face_url}/api/authenticate`
      : process.env.ID4FACE_AUTH_URL

    if (!authUrl) throw new Error("ID4FACE_AUTH_URL no está configurada.")

    const username = tenant?.eclipsoft_user || process.env.ID4FACE_USER
    const password = tenant?.eclipsoft_pass || process.env.ID4FACE_PASS

    const response = await axios.post(
      authUrl,
      { username, password },
      {
        headers:    { "Content-Type": "application/json" },
        httpsAgent: proxyAgent
      }
    )

    const token = response.data?.id_token
    if (!token) throw new Error("No se obtuvo id_token de ID4FACE.")

    return token
  } catch (error) {
    console.error("Error generando token ID4FACE:", error.response?.status || error.message)
    throw error
  }
}

module.exports = { generateToken }