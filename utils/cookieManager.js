import fs from 'fs'
import path from 'path'

const COOKIE_FILE = path.join(process.cwd(), 'cookies.json')

export async function saveCookies(cookies) {
  try {
    await fs.promises.writeFile(COOKIE_FILE, JSON.stringify(cookies, null, 2))
    return true
  } catch (error) {
    console.error('Error saving cookies:', error)
    return false
  }
}

export async function loadCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(await fs.promises.readFile(COOKIE_FILE, 'utf8'))
      return cookies
    }
    return null
  } catch (error) {
    console.error('Error loading cookies:', error)
    return null
  }
}

export function clearCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      fs.unlinkSync(COOKIE_FILE)
    }
    return true
  } catch (error) {
    console.error('Error clearing cookies:', error)
    return false
  }
}