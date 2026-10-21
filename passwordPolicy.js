function validarPassword(p) {
  const faltan = [];
  if (typeof p !== 'string' || p.length < 8) faltan.push('mínimo 8 caracteres');
  if (!/[A-Z]/.test(p)) faltan.push('una mayúscula');
  if (!/[a-z]/.test(p)) faltan.push('una minúscula');
  if (!/[0-9]/.test(p)) faltan.push('un número');
  return faltan;
}

function validarEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

module.exports = { validarPassword, validarEmail };