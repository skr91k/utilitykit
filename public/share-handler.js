/*
 * Web Share Target receiver for MoneyFlow.
 *
 * Android posts a shared image to /money/share as multipart/form-data. A file
 * cannot travel in a URL, and a service worker cannot hand one to a page that is
 * not running yet, so the picture is parked in Cache Storage and the browser is
 * redirected to /money?shared=1. MoneyFlow collects it on mount and clears the
 * entry — see the SHARE_CACHE / SHARE_KEY / SHARE_FLAG constants there, which
 * must match the ones below.
 *
 * Pulled into the generated Workbox worker via workbox.importScripts in
 * vite.config.ts. Workbox only routes GET navigations, so this POST falls
 * through to the listener here.
 */

const SHARE_CACHE = 'money-share-inbox'
const SHARE_KEY = '/__shared-receipt'
const SHARE_ACTION = '/money/share'

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== SHARE_ACTION) return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        // The manifest names the field "images" and allows several, but a receipt
        // is one picture — take the first entry that actually carries bytes.
        const file = form.getAll('images').find(entry => entry && entry.size > 0)
        if (file) {
          const cache = await caches.open(SHARE_CACHE)
          await cache.put(
            SHARE_KEY,
            new Response(file, { headers: { 'content-type': file.type || 'image/jpeg' } }),
          )
        }
      } catch (err) {
        // A failed hand-off must still land the user on the page rather than an
        // error screen; they can attach the image by hand from there.
        console.error('MoneyFlow share target failed:', err)
      }

      // 303 so the browser follows with a GET — a redirected POST would repost.
      return Response.redirect(new URL('/money?shared=1', self.location.origin).href, 303)
    })(),
  )
})
