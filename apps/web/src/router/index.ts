import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '../composables/useSession'

/**
 * Address of a view, in the workspace that is open: its Overview is the workspace's own
 * address.
 */
export function viewPath(viewId: string, rootViewId: string): string {
  const workspace = String(router.currentRoute.value.params.workspace ?? '')
  const base = `/w/${encodeURIComponent(workspace)}`
  return viewId === rootViewId ? base : `${base}/view/${encodeURIComponent(viewId)}`
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('../pages/SignIn.vue') },
    // The start: leads to the workspace that was open last.
    { path: '/', name: 'start', component: () => import('../pages/StartPage.vue') },
    { path: '/w/:workspace', name: 'workspace', component: () => import('../pages/WorkspacePage.vue'), props: true },
    { path: '/w/:workspace/view/:viewId', name: 'view', component: () => import('../pages/WorkspacePage.vue'), props: true },
    { path: '/users', name: 'users', component: () => import('../pages/UsersPage.vue'), meta: { admin: true } },
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

// Nobody uses the app without being signed in. The server is asked once who that is; when it
// does not answer, the page that was asked for says so (it asks again itself).
router.beforeEach(async (to) => {
  const { user, load } = useSession()
  if (user.value === undefined) {
    try {
      await load()
    } catch {
      return true
    }
  }
  if (to.name === 'login') {
    // Signed in already: on to where the sign-in was meant to lead.
    return user.value ? next(to.query.next) : true
  }
  if (!user.value) return { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } }
  if (to.meta.admin && user.value.role !== 'admin') return '/'
  return true
})

/** Where to go after a sign-in: an address of this app, never one somebody else's link names. */
export function next(wanted: unknown): string {
  return typeof wanted === 'string' && wanted.startsWith('/') && !wanted.startsWith('//') && !wanted.startsWith('/login') ? wanted : '/'
}

export default router
