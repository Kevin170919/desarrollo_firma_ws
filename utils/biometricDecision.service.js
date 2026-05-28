/**
 * Evalúa el resultado biométrico devuelto por el componente id4face
 * y determina si la sesión está APPROVED o REJECTED.
 */
function evaluateBiometric(result) {
  if (!result) {
    return { decision: "REJECTED", similarity: 0, message: "Sin resultado biométrico" }
  }

  const match = parseFloat(result.match || result.similarity || 0)
  const status = result.status || ""
  const blinked = result.blinked === true

  if (status === "VERIFIED" && match >= 98 && blinked) {
    return {
      decision: "APPROVED",
      similarity: match,
      message: "Verificación biométrica aprobada"
    }
  }

  return {
    decision: "REJECTED",
    similarity: match,
    message: result.detail || "Verificación biométrica rechazada"
  }
}

module.exports = { evaluateBiometric }
