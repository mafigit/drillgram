import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import { adoptFormerKeys } from './lib/formerKeys'
import router from './router'

// Before anything reads what the browser has saved: what an earlier name of the app left there.
adoptFormerKeys()

const app = createApp(App)

app.use(router)

app.mount('#app')
