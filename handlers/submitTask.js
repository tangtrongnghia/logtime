import fetch from 'node-fetch'
import FormData from 'form-data'
import puppeteer from 'puppeteer'
import { saveCookies, loadCookies } from '../utils/cookieManager.js'

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} code
 * @property {string} note
 * @property {string} activity
 * @property {string|number} time
 */

/**
 * @param {Task[]} tasks - Danh sách task cần submit
 */
export async function submitTask(tasks) {
  const formData = new FormData()
  // const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  // Launch a new browser instance
  const puppeteerOptions = process.env.APP_ENV == 'local'
    ? { headless: false }
    : { headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  const browser = await puppeteer.launch(puppeteerOptions)
  const page = await browser.newPage()

  // Try to load saved cookies
  const savedCookies = await loadCookies()
  if (savedCookies) {
    await page.setCookie(...savedCookies)
  }

  await page.authenticate({
    username: process.env.BASIC_AUTH_USER,
    password: process.env.BASIC_AUTH_PW
  });

  // Navigate directly to timelogs page with Basic Auth
  const baseUrl = 'https://wepro.rcvn.work'
  await page.goto(`${baseUrl}/account/timelogs/multi_create_simple`, { waitUntil: 'networkidle0' })

  // Check if we were redirected to login page
  const currentUrl = page.url()

  if (currentUrl.includes('/login')) {
    console.log('Session expired, performing login...')

    // Fill in the email and password fields
    await page.type('input[name="email"]', process.env.WEPRO_USER)
    await page.type('input[name="password"]', process.env.WEPRO_PW)

    // Check the "Remember Me" checkbox if needed
    const rememberMeCheckbox = await page.$('input[name="remember"]')
    if (rememberMeCheckbox) {
      await rememberMeCheckbox.click()
    }

    // Submit the login form and wait for navigation to timelogs page
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    ])

    await page.reload({ waitUntil: 'networkidle0' });

    // Save cookies after successful login
    const cookies = await page.cookies()
    await saveCookies(cookies)
    console.log('Login successful, cookies saved')
  } else {
    console.log('Using saved cookies, no login required')
  }

  // Get the _token value from the hidden input field
  const token = await page.$eval('input[name="_token"]', el => el.value)
  formData.append('_token', token)

  // Get current cookies
  const cookies = await page.cookies()
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')

  // // Click the button to open the modal
  // await page.click('a.btn.btn-primary.rounded.f-14.p-2.mr-3.openRightModal.float-left')

  // // Wait for modal selector to appear
  // await page.waitForSelector('#save-timelog-form', { visible: true });

  // Wait for the modal to load
  // await wait(1000)

  // Extract task IDs and names from the dropdown
  const assignedtasks = await page.$$eval('select[name="task_id[]"] option', options => {
    return options.map(option => {
      const id = option.value
      const name = option.getAttribute('data-content')

      let projectCode = null
      if (name) {
        const match = name.match(/\.(#?[a-zA-Z0-9]{6,}\.\d{2,})/)
        projectCode = match ? match[1].replace(/^#+/, '') : null
      }

      return { id, code: projectCode }
    })
  })

  // Extract activities from the dropdown
  const activities = await page.$$eval('select[name="custom_fields_data[activity_1][]"] option', options => {
    return options.map(option => ({
      value: option.value,
      label: option.textContent.trim()
    }))
  })

  const userId = await page.$eval(
    '.profile-box a[href*="/account/employees/"]',
    (el) => {
      const href = el.getAttribute('href')
      const match = href.match(/\/employees\/(\d+)/)
      return match ? match[1] : null
    }
  )

  // Close the browser
  await browser.close()

  // Form data
  formData.append("f_email", "")
  formData.append("f_slack_username", "")
  formData.append("redirect_url", "")
  formData.append("user_id", userId)
  formData.append("start_date", new Date().toISOString().slice(0, 10))

  for (const task of tasks) {
    for (const assignedtask of assignedtasks) {
      if (assignedtask.code == task.code) {
        task.activity = task.activity.replace(/[</]/g, '-')
        task.status = true

        const activity = activities.find(item => item.label === task.activity)

        formData.append('project_id_check[]', '')
        formData.append('task_id[]', assignedtask.id || '')
        formData.append('custom_fields_data[activity_1][]', activity?.value || '')
        formData.append('memo[]', task.note || activity?.value || '')
        formData.append('wp_task_time[]', task.time || 0.1)
        break
      }
    }

    task.status = !!task.status
  }

  // Use fetch with the cookies
  const response = await fetch('https://wepro.rcvn.work/account/timelogs/multi_store_simple', {
    method: "POST",
    headers: {
      'accept': 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en-US,en;q=0.9,vi;q=0.8,ja;q=0.7',
      'authorization': 'Basic ' + btoa(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PW}`),
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'cookie': cookieString,
      'x-requested-with': 'XMLHttpRequest',
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Error: ${response.status} - ${errorText}`)
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()

  tasks.status = data.status

  return tasks
}
