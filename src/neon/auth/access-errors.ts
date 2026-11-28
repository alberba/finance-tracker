/**
 * Better Auth answers in English. The login shows its
 * common refusals in Spanish; anything else (our own server errors are
 * already Spanish) passes through as it came.
 */
const SPANISH: Record<string, string> = {
  'Invalid email or password': 'El correo o la contraseña no son correctos.',
  'Invalid password': 'La contraseña no es correcta.',
  'Invalid OTP': 'El código no es correcto. Revisa el último que te enviamos.',
  'OTP expired': 'El código ha caducado. Pide otro.',
  'Too many attempts': 'Demasiados intentos. Pide un código nuevo.',
  'Password too short': 'La contraseña es demasiado corta.',
  'User not found': 'No hay ninguna cuenta con ese correo.',
  'User already exists.': 'Ya hay una cuenta con ese correo.',
  'User already exists. Use another email.': 'Ya hay una cuenta con ese correo.',
}

export function accessErrorText(message: string): string {
  return SPANISH[message] ?? message
}
