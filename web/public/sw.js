// Service worker do Crypto Monitor — recebe Web Push e mostra a notificação do
// navegador, mesmo com o app fechado. Registrado em main.tsx.
// O payload vem do alerts-dispatch: { title, body, url, tag }.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Crypto Monitor", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Crypto Monitor";
  const options = {
    body: data.body || "",
    tag: data.tag,
    renotify: false,
    data: { url: data.url || "/alerts" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicar na notificação foca uma aba existente (ou abre uma nova) na rota do alerta.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
