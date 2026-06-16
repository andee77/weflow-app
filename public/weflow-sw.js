// WeFlow Service Worker — handles background push notifications

const CACHE = "weflow-v3";

// ── Install & cache shell ──────────────────────────────────────────────────
self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(clients.claim());
});

// ── Push event — fired by browser when a push arrives ─────────────────────
self.addEventListener("push", e => {
  let data = { title: "WeFlow", body: "You have a deadline coming up!", tag: "weflow-deadline" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      tag:     data.tag,
      icon:    "/icon-192.png",
      badge:   "/icon-192.png",
      vibrate: [200, 100, 200],
      data:    { url: data.url || "/" },
      actions: [
        { action: "open",    title: "Open WeFlow" },
        { action: "dismiss", title: "Dismiss" },
      ],
    })
  );
});

// ── Notification click — open the app ─────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) return c.focus();
      }
      return clients.openWindow(e.notification.data?.url || "/");
    })
  );
});

// ── Background sync — check deadlines periodically ────────────────────────
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-deadlines") {
    e.waitUntil(checkDeadlines());
  }
});

async function checkDeadlines() {
  try {
    const cache = await caches.open(CACHE);
    const res   = await cache.match("/weflow-tasks.json");
    if (!res) return;
    const tasks = await res.json();
    const today = new Date();
    today.setHours(0,0,0,0);

    const urgent = tasks.filter(t => {
      if (t.done) return false;
      const due = new Date(t.deadline);
      due.setHours(0,0,0,0);
      const diff = Math.ceil((due - today) / 86400000);
      return diff <= 1;
    });

    if (!urgent.length) return;

    const overdue = urgent.filter(t => {
      const due = new Date(t.deadline);
      due.setHours(0,0,0,0);
      return due < today;
    });

    const dueToday = urgent.filter(t => {
      const due = new Date(t.deadline);
      due.setHours(0,0,0,0);
      return due.getTime() === today.getTime();
    });

    if (overdue.length) {
      await self.registration.showNotification("⚠️ WeFlow — Overdue", {
        body: overdue.map(t => t.title).join(", "),
        tag:  "weflow-overdue",
        icon: "/icon-192.png",
        vibrate: [300, 100, 300, 100, 300],
      });
    }

    if (dueToday.length) {
      await self.registration.showNotification("📅 WeFlow — Due Today", {
        body: dueToday.map(t => t.title).join(", "),
        tag:  "weflow-today",
        icon: "/icon-192.png",
        vibrate: [200, 100, 200],
      });
    }
  } catch (err) {
    console.error("WeFlow SW deadline check failed:", err);
  }
}
