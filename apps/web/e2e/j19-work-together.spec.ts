import { test, expect } from './fixtures.ts'

// J19 Work together on one diagram: docs/journeys.md#j19-work-together-on-one-diagram
// Two browsers that find each other through the site and then talk directly. Only the app
// without a server shares so far: with a server the journey skips itself.
const NO_SERVER_ONLY = 'Only the app without a server shares a workspace so far.'

test('J19 Two people change one diagram together and see each other', async ({ page, editor, browserOf, account, server, consoleErrors }) => {
  test.skip(server, NO_SERVER_ONLY)
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  // Nobody is here but Ada: no list of people before she shares.
  await expect(editor.people).toHaveCount(0)
  const link = await editor.share('Ada')
  expect(new URL(link).pathname).toMatch(/^\/s\/[\w-]{22}$/)
  await expect(editor.people).toHaveCount(1)

  // Ben opens the link in a browser of his own: first who he is, nothing of the diagram yet.
  const ben = await browserOf(account)
  await ben.page.goto(link)
  await expect(ben.page.getByRole('heading', { name: 'Join a shared workspace' })).toBeVisible()
  await expect(ben.editor.canvas).toHaveCount(0)
  await ben.editor.join('Ben')
  await expect(ben.editor.element('Online Shop')).toBeVisible()

  // Each sees that the other is there.
  await expect(editor.people).toHaveCount(2)
  await expect(editor.page.getByRole('listitem', { name: 'Ada (you)' })).toBeVisible()
  await expect(editor.page.getByRole('listitem', { name: 'Ben', exact: true })).toBeVisible()
  await expect(ben.page.getByRole('listitem', { name: 'Ada', exact: true })).toBeVisible()
  await expect(ben.page.getByRole('listitem', { name: 'Ben (you)' })).toBeVisible()

  // Each sees what the other does, without a reload.
  await ben.editor.addElement('Person', 'Customer')
  await expect(editor.element('Customer')).toBeVisible()
  await editor.rename('Online Shop', 'Web Shop')
  await expect(ben.editor.element('Web Shop')).toBeVisible()
  await expect(ben.editor.element('Online Shop')).toHaveCount(0)
  // One after the other is no conflict: nobody is told that a change was not kept.
  await expect(editor.errors).toHaveCount(0)
  await expect(ben.editor.errors).toHaveCount(0)

  // Ben's pointer, with his name, where he points: on the same card for Ada, wherever that
  // card is on her screen.
  const his = (await ben.editor.element('Customer').boundingBox())!
  await ben.page.mouse.move(his.x + his.width / 2, his.y + his.height / 2, { steps: 4 })
  const pointer = editor.pointerOf('Ben')
  await expect(pointer).toContainText('Ben')
  await expect
    .poll(async () => {
      const [tip, card] = [(await pointer.boundingBox())!, (await editor.element('Customer').boundingBox())!]
      return tip.x >= card.x && tip.x <= card.x + card.width && tip.y >= card.y && tip.y <= card.y + card.height
    })
    .toBe(true)
  // Nobody sees a second pointer of their own.
  await expect(ben.editor.pointerOf('Ben')).toHaveCount(0)

  // Ben opens the box: his address stays the session's, and his pointer is on another
  // diagram than Ada's now.
  await ben.editor.drillDown('Web Shop')
  await expect(ben.page).toHaveURL(/\/s\/[\w-]{22}\/view\/inside-/)
  await expect(ben.editor.title).toHaveText('Web Shop')
  await ben.page.mouse.move(his.x + 40, his.y + 40, { steps: 4 })
  await expect(pointer).toHaveCount(0)
  await ben.editor.addElement('Container', 'Web App')
  await editor.drillDown('Web Shop')
  await expect(editor.element('Web App')).toBeVisible()
  // On the same diagram again, Ben's pointer is there as soon as it is back on the canvas (he
  // had it on the toolbar to add the card).
  await expect(pointer).toHaveCount(0)
  await ben.page.mouse.move(his.x + 60, his.y + 60, { steps: 4 })
  await expect(pointer).toBeVisible()

  // To empty the workspace is for the one who shares it.
  await expect(ben.page.getByRole('button', { name: 'Clear workspace' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Clear workspace' })).toBeEnabled()

  // Ada stops sharing: Ben is told, and the workspace stays hers, with what they did.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await editor.shareDialog.getByRole('button', { name: 'Stop sharing' }).click()
  await expect(ben.page.getByRole('heading', { name: 'This session is over' })).toBeVisible()
  await expect(ben.editor.canvas).toHaveCount(0)
  await expect(editor.people).toHaveCount(0)
  await page.reload()
  await expect(editor.element('Web App')).toBeVisible()
  await editor.backTo('Overview')
  await expect(editor.element('Customer')).toBeVisible()

  // The link is of that session: nobody is there any more.
  await ben.page.getByRole('button', { name: 'Try again' }).click()
  await expect(ben.page.getByRole('heading', { name: 'Nobody is sharing here right now' })).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J19 A guest who leaves is gone for the others, and the name is asked only once', async ({ page, editor, browserOf, account, server }) => {
  test.skip(server, NO_SERVER_ONLY)
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const link = await editor.share('Ada')

  const ben = await browserOf(account)
  await ben.page.goto(link)
  await ben.editor.join('Ben')
  await expect(editor.people).toHaveCount(2)
  const there = (await ben.editor.element('Online Shop').boundingBox())!
  await ben.page.mouse.move(there.x + 10, there.y + 10, { steps: 3 })
  await expect(editor.pointerOf('Ben')).toBeVisible()

  // Ben leaves: back at his own diagrams, and Ada sees neither him nor his pointer.
  await ben.page.getByRole('button', { name: 'Share', exact: true }).click()
  await ben.editor.shareDialog.getByRole('button', { name: 'Leave' }).click()
  await expect(ben.editor.workspace).toContainText('My workspace')
  await expect(ben.editor.element('Online Shop')).toHaveCount(0)
  await expect(editor.people).toHaveCount(1)
  await expect(editor.pointerOf('Ben')).toHaveCount(0)

  // He comes again: the browser knows his name, and a second guest joins beside him.
  await ben.page.goto(link)
  await expect(ben.page.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ben')
  await ben.page.getByRole('form', { name: 'Join' }).getByRole('button', { name: 'Join' }).click()
  const cleo = await browserOf(account)
  await cleo.page.goto(link)
  await cleo.editor.join('Cleo')
  await expect(editor.people).toHaveCount(3)
  await expect(cleo.editor.people).toHaveCount(3)

  // What one guest does, the other guest sees too.
  await cleo.editor.addElement('Person', 'Customer')
  await expect(ben.editor.element('Customer')).toBeVisible()
  await expect(editor.element('Customer')).toBeVisible()

  // Ada closes the workspace by going to another one: the session ends for both.
  await editor.workspace.click()
  await page.getByRole('menuitem', { name: 'New workspace' }).click()
  await page.getByRole('dialog', { name: 'New workspace' }).getByLabel('Name').fill('Another')
  await page.getByRole('dialog', { name: 'New workspace' }).getByRole('button', { name: 'Create' }).click()
  await expect(ben.page.getByRole('heading', { name: 'This session is over' })).toBeVisible()
  await expect(cleo.page.getByRole('heading', { name: 'This session is over' })).toBeVisible()
})

test('J19 Two browsers that find no direct way work together through the site, which reads nothing of it', async ({ page, editor, browserOf, account, server, consoleErrors }) => {
  test.skip(server, NO_SERVER_ONLY)
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const link = await editor.share('Ada')
  // The link carries the key of the session after its "#", the part no server is sent.
  expect(new URL(link).hash).toMatch(/^#[\w-]{22}$/)

  // Ben's browser connects to no other one directly: as behind a strict firewall, or with
  // WebRTC switched off, which this is.
  const noDirectWay = () => {
    ;(window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection = undefined
  }
  const ben = await browserOf(account)
  await ben.context.addInitScript(noDirectWay)
  // Everything that passes between his browser and the site's meeting point.
  const passed: string[] = []
  ben.page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => passed.push(String(frame.payload)))
    socket.on('framereceived', (frame) => passed.push(String(frame.payload)))
  })
  await ben.page.goto(link)
  await ben.editor.join('Ben')
  await expect(ben.editor.element('Online Shop')).toBeVisible()
  await expect(editor.people).toHaveCount(2)
  await expect(ben.editor.people).toHaveCount(2)

  // As with a direct way: each sees what the other does, and Ada sees where Ben points.
  await ben.editor.addElement('Person', 'Customer')
  await expect(editor.element('Customer')).toBeVisible()
  await editor.rename('Online Shop', 'Web Shop')
  await expect(ben.editor.element('Web Shop')).toBeVisible()
  const his = (await ben.editor.element('Customer').boundingBox())!
  await ben.page.mouse.move(his.x + his.width / 2, his.y + his.height / 2, { steps: 6 })
  await expect(editor.pointerOf('Ben')).toBeVisible()
  await expect(editor.errors).toHaveCount(0)
  await expect(ben.editor.errors).toHaveCount(0)

  // It went through the site, and the site could read none of it.
  expect(passed.filter((frame) => frame.includes('"relay"')).length).toBeGreaterThan(3)
  for (const frame of passed) {
    for (const said of ['Online Shop', 'Web Shop', 'Customer', 'softwareSystem']) expect(frame).not.toContain(said)
  }

  // An address inside the session keeps its key: a reload there joins again, the same way.
  await ben.editor.drillDown('Web Shop')
  await expect(ben.page).toHaveURL(/\/view\/inside-[^#]+#[\w-]{22}$/)
  await ben.page.reload()
  await ben.page.getByRole('form', { name: 'Join' }).getByRole('button', { name: 'Join' }).click()
  await expect(ben.editor.title).toHaveText('Web Shop')
  await expect(editor.people).toHaveCount(2)

  // A link without its key is no way in for a browser that needs the site to pass things on.
  const dana = await browserOf(account)
  await dana.context.addInitScript(noDirectWay)
  await dana.page.goto(link.replace(/#.*$/, ''))
  await dana.editor.join('Dana')
  await expect(dana.page.getByRole('heading', { name: 'No way to the other browser' })).toBeVisible()
  await expect(editor.people).toHaveCount(2)

  // Ada stops sharing: Ben is told through the site, too.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await editor.shareDialog.getByRole('button', { name: 'Stop sharing' }).click()
  await expect(ben.page.getByRole('heading', { name: 'This session is over' })).toBeVisible()
  await expect(ben.page.getByRole('status')).toContainText('stopped sharing')
  expect(consoleErrors).toEqual([])
})

test('J19 A link that nobody shares says so', async ({ page, editor, server, consoleErrors }) => {
  test.skip(server, NO_SERVER_ONLY)
  await page.goto(`/s/${'a'.repeat(22)}`)
  await editor.join('Ben')
  await expect(page.getByRole('heading', { name: 'Nobody is sharing here right now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
  // The way back to what is his.
  await page.getByRole('link', { name: 'To my own diagrams' }).click()
  await expect(editor.workspace).toContainText('My workspace')
  expect(consoleErrors).toEqual([])
})
