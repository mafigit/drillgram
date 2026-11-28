import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

// J17 Comment on the diagram: docs/journeys.md#j17-comment-on-the-diagram

/** Whether the tip of a pin (its lower left corner) lies on a card. */
async function pinOn(pin: Locator, card: Locator): Promise<boolean> {
  const [tip, box] = [(await pin.boundingBox())!, (await card.boundingBox())!]
  const [x, y] = [tip.x, tip.y + tip.height]
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
}

test('J17 A comment asks for a name once, goes along with its card, and is no change of the diagram', async ({ page, editor, server, consoleErrors }) => {
  test.skip(server, 'With a server the author is the user who is signed in: nobody is asked.')
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')

  // The first comment asks for a name.
  await editor.startComment(shop)
  await expect(editor.commentThread.getByRole('textbox', { name: 'Your name' })).toBeVisible()
  await editor.commentThread.getByRole('textbox', { name: 'Your name' }).fill('Ada')
  await editor.commentThread.getByRole('textbox', { name: 'Comment' }).fill('Who owns this?')
  await editor.commentThread.getByRole('button', { name: 'Post' }).click()
  await expect(editor.commentThread).toHaveCount(0)
  const owns = editor.commentPin('Who owns this?')
  await expect(owns).toHaveAccessibleName('Comment by Ada: Who owns this?')
  await expect(owns).toHaveText('A')
  await expect.poll(() => pinOn(owns, shop)).toBe(true)

  // It goes where the card goes, and stays after a reload.
  await editor.move('Online Shop', { x: 240, y: 120 })
  await expect.poll(() => pinOn(owns, shop)).toBe(true)
  await page.reload()
  await expect(owns).toBeVisible()
  await expect.poll(() => pinOn(owns, editor.element('Online Shop'))).toBe(true)

  // Opened, it shows who said what, and takes a reply.
  await editor.reply('Who owns this?', 'The shop team.')
  await expect(editor.threadComments).toHaveCount(2)
  await expect(editor.threadComments.nth(0)).toContainText('Ada')
  await expect(editor.threadComments.nth(0)).toContainText('Who owns this?')
  await expect(editor.threadComments.nth(1)).toContainText('Ada')
  await expect(editor.threadComments.nth(1)).toContainText('The shop team.')
  await page.keyboard.press('Escape')
  await expect(editor.commentThread).toHaveCount(0)
  await expect(owns).toContainText('2')

  // Undo takes back the move, not the comments; the history does not list them.
  const moved = (await shop.boundingBox())!
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await shop.boundingBox())!.x).toBeLessThan(moved.x - 100)
  await expect(owns).toContainText('2')
  await expect.poll(() => pinOn(owns, shop)).toBe(true)
  await editor.openHistory()
  await expect(editor.changes).toHaveCount(2)
  await expect(editor.changes.filter({ hasText: /owns|shop team/ })).toHaveCount(0)
  await editor.openHistory()

  // The name is not asked again: a comment on the empty canvas beside the card.
  const card = (await shop.boundingBox())!
  await editor.startComment({ x: card.x + card.width + 160, y: card.y + card.height / 2 })
  await expect(editor.commentThread.getByRole('textbox', { name: 'Your name' })).toHaveCount(0)
  await editor.commentThread.getByRole('textbox', { name: 'Comment' }).fill('Is payment missing?')
  await editor.commentThread.getByRole('button', { name: 'Post' }).click()
  const payment = editor.commentPin('Is payment missing?')
  await expect(payment).toHaveAccessibleName('Comment by Ada: Is payment missing?')
  expect(await pinOn(payment, shop)).toBe(false)

  // Resolved, it leaves the canvas for the list of resolved comments, and comes back from there.
  await owns.click()
  await editor.commentThread.getByRole('button', { name: 'Resolve' }).click()
  await expect(owns).toHaveCount(0)
  await editor.openComments()
  await expect(editor.commentList('Resolved')).toHaveCount(1)
  await expect(editor.commentList('Resolved')).toContainText('Who owns this?')
  await expect(editor.commentList('Open')).toHaveCount(1)
  await expect(editor.commentList('Open')).toContainText('Is payment missing?')
  await editor.commentList('Resolved').getByRole('button', { name: 'Reopen' }).click()
  await expect(owns).toBeVisible()
  await expect(editor.commentList('Resolved')).toHaveCount(0)
  await expect(editor.commentList('Open')).toHaveCount(2)
  await editor.openComments()

  // Deleted, it is gone, also after a reload.
  await payment.click()
  await editor.commentThread.getByRole('button', { name: 'Delete' }).click()
  await editor.commentThread.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(payment).toHaveCount(0)
  await page.reload()
  await expect(editor.commentPins).toHaveCount(1)
  await expect(owns).toContainText('2')

  // The name is the one "Share" starts with.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(editor.shareDialog.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ada')
  expect(consoleErrors).toEqual([])
})

test('J17 With a server the author is the user who is signed in, also in a locked workspace', async ({ page, editor, server, account, consoleErrors }) => {
  test.skip(!server, 'Without a server nobody is signed in: the app asks for a name.')
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')

  await editor.startComment(shop)
  await expect(editor.commentThread.getByRole('textbox', { name: 'Your name' })).toHaveCount(0)
  await editor.commentThread.getByRole('textbox', { name: 'Comment' }).fill('Who owns this?')
  await editor.commentThread.getByRole('button', { name: 'Post' }).click()
  await expect(editor.commentPin('Who owns this?')).toHaveAccessibleName(`Comment by ${account.name}: Who owns this?`)

  // Locked, the diagram is looked at: and talked about.
  await editor.lockButton.click()
  await editor.reply('Who owns this?', 'The shop team.')
  await expect(editor.threadComments).toHaveCount(2)
  await expect(editor.threadComments.nth(1)).toContainText(account.name)
  await page.keyboard.press('Escape')
  await expect(editor.commentThread).toHaveCount(0)

  // C presses "Comment", Escape lets go of it.
  await page.keyboard.press('c')
  await expect(editor.commentButton).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(editor.commentButton).toHaveAttribute('aria-pressed', 'false')
  expect(consoleErrors).toEqual([])
})

test('J17 In a shared session the comments carry the names people share and join with', async ({ editor, browserOf, account, server, consoleErrors }) => {
  test.skip(server, 'Only the app without a server shares a workspace so far.')
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const link = await editor.share('Ada')

  const ben = await browserOf(account)
  await ben.page.goto(link)
  await ben.editor.join('Ben')
  await expect(ben.editor.element('Online Shop')).toBeVisible()

  // Ben is not asked who he is: he said so when he joined. Ada sees his comment at once.
  await ben.editor.startComment(ben.editor.element('Online Shop'))
  await expect(ben.editor.commentThread.getByRole('textbox', { name: 'Your name' })).toHaveCount(0)
  await ben.editor.commentThread.getByRole('textbox', { name: 'Comment' }).fill('Who owns this?')
  await ben.editor.commentThread.getByRole('button', { name: 'Post' }).click()
  await expect(editor.commentPin('Who owns this?')).toHaveAccessibleName('Comment by Ben: Who owns this?')
  await expect(editor.commentPin('Who owns this?')).toHaveText('B')

  // Nor is Ada, who shares under her name.
  await editor.commentPin('Who owns this?').click()
  await expect(editor.commentThread.getByRole('textbox', { name: 'Your name' })).toHaveCount(0)
  await editor.commentThread.getByRole('textbox', { name: 'Reply' }).fill('The shop team.')
  await editor.commentThread.getByRole('button', { name: 'Reply', exact: true }).click()
  await ben.editor.commentPin('Who owns this?').click()
  await expect(ben.editor.threadComments).toHaveCount(2)
  await expect(ben.editor.threadComments.nth(1)).toContainText('Ada')
  await expect(ben.editor.threadComments.nth(1)).toContainText('The shop team.')
  expect(consoleErrors).toEqual([])
})
