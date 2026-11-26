import { createRouter, createWebHistory } from 'vue-router'
import DiagramEditor from '../components/DiagramEditor.vue'

/** Address of a view: the Overview is the start page. */
export function viewPath(viewId: string, rootViewId: string): string {
  return viewId === rootViewId ? '/' : `/view/${encodeURIComponent(viewId)}`
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: DiagramEditor },
    { path: '/view/:viewId', component: DiagramEditor, props: true },
    { path: '/:unknown(.*)*', redirect: '/' },
  ],
})

export default router
