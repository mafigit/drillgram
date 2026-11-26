import type { ElementKind } from './model'
import {
  ROOT_VIEW_ID,
  addObject,
  connect,
  emptyWorkspace,
  ensureViewInside,
  findViewInside,
  moveObject,
  placeObject,
  setConnectionLabel,
} from './workspace'
import type { ObjectDetails, Point, Workspace } from './workspace'

/**
 * Builds a workspace through the model's own editing functions, so an example can never hold
 * something the editor could not have made. Every step fails loudly if the model refuses it.
 */
class Builder {
  workspace = emptyWorkspace()

  /** Add a new object to a view at a place; returns its id. */
  add(viewId: string, kind: ElementKind, name: string, at: Point, details: ObjectDetails): string {
    const known = new Set(this.workspace.model.objects.map((o) => o.id))
    this.workspace = addObject(this.workspace, viewId, kind, name, details)
    const added = this.workspace.model.objects.find((o) => !known.has(o.id))
    if (!added) throw new Error(`Could not add ${name} to ${viewId}`)
    this.workspace = moveObject(this.workspace, viewId, added.id, at)
    return added.id
  }

  /** Show an object of the model on another view at a place. */
  show(viewId: string, objectId: string, at: Point): void {
    const before = this.workspace
    this.workspace = moveObject(placeObject(before, viewId, objectId), viewId, objectId, at)
    if (this.workspace === before) throw new Error(`Could not show ${objectId} on ${viewId}`)
  }

  link(viewId: string, from: string, to: string, label: string, technology = ''): void {
    const known = new Set(this.workspace.model.connections.map((c) => c.id))
    this.workspace = connect(this.workspace, viewId, from, to, label)
    const added = this.workspace.model.connections.find((c) => !known.has(c.id))
    if (!added) throw new Error(`Could not connect ${from} to ${to} on ${viewId}`)
    this.workspace = setConnectionLabel(this.workspace, added.id, label, technology)
  }

  /** The Container diagram of a software system, or the Component diagram of a container. */
  inside(objectId: string): string {
    this.workspace = ensureViewInside(this.workspace, objectId)
    const view = findViewInside(this.workspace, objectId)
    if (!view) throw new Error(`${objectId} has no diagram inside`)
    return view.id
  }
}

/**
 * A made-up online bookshop: 5 kinds of people, 10 software systems of its own and 7 external
 * ones on the System Landscape, the containers of two systems and the components of one container.
 * Everything out of the Web Shop is connected at the lowest level it is known at, so the higher
 * diagrams show those connections one level up.
 */
export function bookshopExample(): Workspace {
  const b = new Builder()
  const L = ROOT_VIEW_ID
  const ours = (description: string): ObjectDetails => ({ description })
  const theirs = (description: string): ObjectDetails => ({ description, external: true })

  // People, in a row above the systems they use.
  const customer = b.add(L, 'person', 'Customer', { x: 550, y: 40 }, ours('Buys books and follows their orders.'))
  const agent = b.add(L, 'person', 'Support Agent', { x: 1060, y: 40 }, ours('Answers customer questions.'))
  const finance = b.add(L, 'person', 'Finance Analyst', { x: 1400, y: 40 }, ours('Reconciles payments and reports revenue.'))
  const marketing = b.add(L, 'person', 'Marketing Manager', { x: 1910, y: 40 }, ours('Plans campaigns and reads their results.'))
  const picker = b.add(L, 'person', 'Warehouse Worker', { x: 2420, y: 40 }, ours('Picks, packs and ships orders.'))

  // The bookshop's own software systems.
  const recommendations = b.add(L, 'softwareSystem', 'Recommendations', { x: 40, y: 330 }, ours('Suggests books from what customers bought.'))
  const shop = b.add(L, 'softwareSystem', 'Web Shop', { x: 550, y: 330 }, ours('Lets customers browse and buy books.'))
  const support = b.add(L, 'softwareSystem', 'Support Desk', { x: 1060, y: 330 }, ours('Tracks customer questions until they are solved.'))
  const analytics = b.add(L, 'softwareSystem', 'Analytics', { x: 1740, y: 330 }, ours('Reports on sales, stock and campaigns.'))
  const warehouse = b.add(L, 'softwareSystem', 'Warehouse', { x: 2420, y: 330 }, ours('Guides picking, packing and shipping.'))
  const accounts = b.add(L, 'softwareSystem', 'Customer Accounts', { x: 210, y: 620 }, ours('Holds customer profiles and signs customers in.'))
  const orders = b.add(L, 'softwareSystem', 'Order Management', { x: 890, y: 620 }, ours('Takes an order from checkout to delivery.'))
  const payments = b.add(L, 'softwareSystem', 'Payments', { x: 1570, y: 660 }, ours('Charges customers and records every payment.'))
  const inventory = b.add(L, 'softwareSystem', 'Inventory', { x: 550, y: 910 }, ours('Knows what is in stock and where.'))
  const notifications = b.add(L, 'softwareSystem', 'Notifications', { x: 890, y: 910 }, ours('Sends e-mails and text messages to customers.'))

  // Systems of other companies.
  const ads = b.add(L, 'softwareSystem', 'Ad Network', { x: 1910, y: 620 }, theirs('Shows adverts to chosen audiences.'))
  const signIn = b.add(L, 'softwareSystem', 'Sign-in Provider', { x: 40, y: 910 }, theirs('Lets people sign in with an account they already have.'))
  const tax = b.add(L, 'softwareSystem', 'Tax Service', { x: 1230, y: 910 }, theirs('Works out the sales tax for each country.'))
  const cards = b.add(L, 'softwareSystem', 'Card Processor', { x: 1570, y: 950 }, theirs('Authorises and settles card payments.'))
  const carrier = b.add(L, 'softwareSystem', 'Shipping Carrier', { x: 2080, y: 910 }, theirs('Delivers parcels and reports where they are.'))
  const mail = b.add(L, 'softwareSystem', 'E-mail Provider', { x: 720, y: 1200 }, theirs('Delivers e-mail.'))
  const sms = b.add(L, 'softwareSystem', 'SMS Gateway', { x: 1060, y: 1200 }, theirs('Delivers text messages.'))

  b.link(L, customer, support, 'Asks for help through')
  b.link(L, agent, support, 'Answers questions in')
  b.link(L, picker, warehouse, 'Picks and packs orders with')
  b.link(L, marketing, analytics, 'Reads campaign results in')
  b.link(L, finance, analytics, 'Reads sales reports in')
  b.link(L, finance, payments, 'Reconciles payments in')
  b.link(L, shop, recommendations, 'Gets suggestions from', 'gRPC')
  b.link(L, shop, inventory, 'Checks stock in', 'HTTPS/JSON')
  b.link(L, orders, inventory, 'Reserves stock in', 'HTTPS/JSON')
  b.link(L, orders, warehouse, 'Sends orders to pick to', 'Kafka')
  b.link(L, orders, notifications, 'Asks for order updates from', 'Kafka')
  b.link(L, orders, tax, 'Gets tax amounts from', 'HTTPS/JSON')
  b.link(L, orders, analytics, 'Publishes order events to', 'Kafka')
  b.link(L, payments, cards, 'Authorises cards with', 'HTTPS/JSON')
  b.link(L, accounts, signIn, 'Verifies sign-ins with', 'OpenID Connect')
  b.link(L, notifications, mail, 'Sends e-mails through', 'SMTP')
  b.link(L, notifications, sms, 'Sends text messages through', 'HTTPS/JSON')
  b.link(L, warehouse, carrier, 'Books shipments with', 'HTTPS/XML')
  b.link(L, carrier, orders, 'Reports tracking events to', 'Webhook')
  b.link(L, support, orders, 'Looks up orders in', 'HTTPS/JSON')
  b.link(L, support, accounts, 'Looks up customers in', 'HTTPS/JSON')
  b.link(L, analytics, ads, 'Uploads audiences to', 'HTTPS/JSON')
  b.link(L, recommendations, orders, 'Reads past orders from', 'HTTPS/JSON')

  // Container diagram of the Web Shop.
  const inShop = b.inside(shop)
  b.show(inShop, customer, { x: 550, y: 40 })
  const spa = b.add(inShop, 'container', 'Single-Page App', { x: 210, y: 330 }, { technology: 'Vue 3', description: 'Shows the shop in the browser.' })
  const mobile = b.add(inShop, 'container', 'Mobile App', { x: 890, y: 330 }, { technology: 'Kotlin, Swift', description: 'Shows the shop on phones and tablets.' })
  const api = b.add(inShop, 'container', 'Shop API', { x: 550, y: 620 }, { technology: 'Node.js', description: 'Serves the catalogue, the basket and checkout.' })
  const products = b.add(inShop, 'container', 'Product Database', { x: 210, y: 910 }, { technology: 'PostgreSQL', description: 'Stores books, prices and reviews.' })
  const search = b.add(inShop, 'container', 'Search Index', { x: 550, y: 910 }, { technology: 'OpenSearch', description: 'Finds books by title, author and topic.' })
  const baskets = b.add(inShop, 'container', 'Basket Cache', { x: 890, y: 910 }, { technology: 'Redis', description: 'Keeps open baskets for a week.' })
  b.show(inShop, accounts, { x: 40, y: 620 })
  b.show(inShop, orders, { x: 1060, y: 620 })
  b.show(inShop, payments, { x: 1400, y: 910 })
  b.link(inShop, customer, spa, 'Shops in')
  b.link(inShop, customer, mobile, 'Shops in')
  b.link(inShop, spa, api, 'Loads pages and sends orders through', 'HTTPS/JSON')
  b.link(inShop, mobile, api, 'Loads pages and sends orders through', 'HTTPS/JSON')

  // Component diagram of the Shop API.
  const inApi = b.inside(api)
  const guard = b.add(inApi, 'component', 'Sign-in Guard', { x: 40, y: 40 }, { technology: 'TypeScript', description: 'Lets only signed-in customers check out.' })
  const catalogue = b.add(inApi, 'component', 'Catalogue', { x: 380, y: 40 }, { technology: 'TypeScript', description: 'Lists and searches books.' })
  const basket = b.add(inApi, 'component', 'Basket', { x: 720, y: 40 }, { technology: 'TypeScript', description: 'Keeps what a customer wants to buy.' })
  const checkout = b.add(inApi, 'component', 'Checkout', { x: 1060, y: 40 }, { technology: 'TypeScript', description: 'Turns a basket into a paid order.' })
  b.show(inApi, accounts, { x: 40, y: 330 })
  b.show(inApi, products, { x: 380, y: 330 })
  b.show(inApi, search, { x: 720, y: 330 })
  b.show(inApi, baskets, { x: 1060, y: 330 })
  b.show(inApi, orders, { x: 1400, y: 40 })
  b.show(inApi, payments, { x: 1400, y: 330 })
  b.link(inApi, guard, accounts, 'Checks sign-ins with', 'OpenID Connect')
  b.link(inApi, catalogue, products, 'Reads books and prices from', 'SQL')
  b.link(inApi, catalogue, search, 'Searches books in', 'HTTPS/JSON')
  b.link(inApi, basket, baskets, 'Keeps baskets in', 'RESP')
  b.link(inApi, checkout, basket, 'Reads the basket from')
  b.link(inApi, checkout, orders, 'Places orders in', 'HTTPS/JSON')
  b.link(inApi, checkout, payments, 'Starts payments in', 'HTTPS/JSON')

  // Container diagram of Order Management.
  const inOrders = b.inside(orders)
  const orderApi = b.add(inOrders, 'container', 'Order API', { x: 210, y: 40 }, { technology: 'Kotlin', description: 'Accepts and changes orders.' })
  const worker = b.add(inOrders, 'container', 'Fulfilment Worker', { x: 890, y: 40 }, { technology: 'Kotlin', description: 'Moves each order through picking and shipping.' })
  const orderDb = b.add(inOrders, 'container', 'Order Database', { x: 210, y: 330 }, { technology: 'PostgreSQL', description: 'Stores orders and their history.' })
  const events = b.add(inOrders, 'container', 'Order Events', { x: 550, y: 330 }, { technology: 'Kafka topic', description: 'Carries every change of an order.' })
  b.link(inOrders, orderApi, orderDb, 'Stores orders in', 'SQL')
  b.link(inOrders, orderApi, events, 'Publishes order changes to', 'Kafka')
  b.link(inOrders, worker, events, 'Reads order changes from', 'Kafka')

  return b.workspace
}
