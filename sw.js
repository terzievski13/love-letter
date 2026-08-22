/* Service worker for the mailbox.

   IMPORTANT: this handles push notifications and NOTHING else. There is
   deliberately no 'fetch' handler, so it cannot cache or intercept anything.
   The site transpiles its JSX in the browser at runtime, so a caching service
   worker could serve a stale, half-broken app that is very hard to clear.
   If you ever add caching here, test the whole letter flow afterwards. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // a push with no or malformed payload still deserves a notification
  }

  const title = data.title || "Има ново писмо 💌";
  const options = {
    body: data.body || "Пощенската кутия те чака.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "new-letter",
    renotify: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // if the mailbox is already open somewhere, just bring it forward
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
