import fetch from 'node-fetch'
import FormData from 'form-data'
import puppeteer from 'puppeteer'

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

  // Launch a new browser instance
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()

  // Navigate to the desired URL with Basic Auth
  await page.goto(`https://${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PW}@wepro.rcvn.work`)

  // Custom wait function
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  // Wait for 2 seconds
  await wait(2000)

  // Check if the login form is present
  const loginFormSelector = 'input[name="email"]'
  const isLoginFormPresent = await page.$(loginFormSelector) !== null

  if (isLoginFormPresent) {
    // Fill in the email and password fields
    await page.type('input[name="email"]', process.env.WEPRO_USER) // Replace with your email
    await page.type('input[name="password"]', process.env.WEPRO_PW) // Replace with your password

    // Check the "Remember Me" checkbox if needed
    const rememberMeCheckbox = await page.$('input[name="remember"]')
    if (rememberMeCheckbox) {
      await rememberMeCheckbox.click()
    }

    // Submit the login form
    await Promise.all([
      page.click('button[type="submit"]'), // Adjust the selector for the submit button
      page.waitForNavigation({ waitUntil: 'networkidle0' }), // Wait for navigation to complete
    ])
  }

  // Now navigate to the desired URL after login
  await page.goto('https://wepro.rcvn.work') // Replace with your target URL

  // Wait for the page to load completely
  await wait(2000) // Wait for 2 seconds

  // Get the _token value from the hidden input field
  const token = await page.$eval('input[name="_token"]', el => el.value)
  formData.append('_token', token) // Append the token to formData

  // Get cookies
  const cookies = await page.cookies()

  // Format cookies for fetch
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  console.log(cookieString)

  // Navigate to the account timelogs page
  await page.goto('https://wepro.rcvn.work/account/timelogs') // Replace with your target URL

  console.log(111111)

  // Wait for the page to load completely
  await wait(2000) // Wait for 2 seconds

  // Click the button to open the modal
  await page.click('a.btn.btn-primary.rounded.f-14.p-2.mr-3.openRightModal.float-left') // Adjust the selector as needed

  // Wait for the modal to load
  await wait(2000) // Wait for 2 seconds

  console.log(222222)

  // Extract task IDs and names from the dropdown
  const assignedtasks = await page.$$eval('select[name="task_id[]"] option', options => {
    return options.map(option => {
      const id = option.value
      const name = option.getAttribute('data-content')

      let projectCode = null
      if (name) {
        // Tìm pattern sau dấu chấm: #20xxxx.08 hoặc 202504.005
        const match = name.match(/\.(#?[a-zA-Z0-9]{6,}\.\d{2,})/)
        projectCode = match ? match[1] : null
      }

      return { id, code: projectCode }
    })
  })

  console.log(assignedtasks)

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

        const activity = activities.find(item => item.label === task.activity)

        formData.append('project_id_check[]', '')
        formData.append('task_id[]', assignedtask.id || '')
        formData.append('custom_fields_data[activity_1][]', activity?.value || '')
        formData.append('memo[]', task.note || activity?.value || '')
        formData.append('wp_task_time[]', task.time || 0.1)
        break
      }
    }
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
      'cookie': cookieString, // Include the formatted cookies here
      'x-requested-with': 'XMLHttpRequest',
    },
    body: formData
  });

  // Check if the response is OK
  if (!response.ok) {
    const errorText = await response.text() // Get the response body as text
    console.error(`Error: ${response.status} - ${errorText}`) // Log the error
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  // Handle the response
  const data = await response.json()

  const result = tasks.map(task => {
    return {
      ...task,
      status: data.status,
    }
  })

  return result
}
