import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '../composables/useSession'
import { useWorkspaces } from '../composables/useWorkspaces'
import { mayLeave } from '../lib/agentSharing'
import { browserOnly } from '../lib/api'

/**
 * Address of a view, in the workspace that is open: its Overview is the workspace's own
 * address. In a shared session (`/s/<room>#<key>`) the workspace is the session's, and every
 * address of it keeps the session's key: a reload joins again with it.
 */
export function viewPath(viewId: string, rootViewId: string): string {
  const { params, hash } = router.currentRoute.value
  if (params.room === undefined) {
    const base = `/w/${encodeURIComponent(String(params.workspace ?? ''))}`
    return viewId === rootViewId ? base : `${base}/view/${encodeURIComponent(viewId)}`
  }
  const base = `/s/${encodeURIComponent(String(params.room))}`
  return `${viewId === rootViewId ? base : `${base}/view/${encodeURIComponent(viewId)}`}${hash}`
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
    // A workspace somebody else shares, by its link (collab/): only the app without a server
    // has sessions so far.
    ...(browserOnly
      ? [
          { path: '/s/:room', name: 'shared', component: () => import('../pages/SharedPage.vue'), props: true },
          { path: '/s/:room/view/:viewId', name: 'shared-view', component: () => import('../pages/SharedPage.vue'), props: true },
        ]
      : []),
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

// With an agent connected to the open workspace (J7), leaving it ends the agent's connection:
// asked first, for every way out (the workspace menu, a link, the browser's back button),
// out of a shared session too. A workspace that was just deleted is left without a question.
router.beforeEach((to, from) => {
  const { workspaces } = useWorkspaces()
  return mayLeave(to, from, (place) => from.params.room !== undefined || workspaces.value.some((known) => known.id === place))
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
