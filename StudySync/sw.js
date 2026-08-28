// PLANNERAPP - BACKGROUND SERVICE WORKER & ALARM NOTIFIER

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// MESSAGING ENGINE PARA SA BACKGROUND ALARMS
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_ALARM') {
        const { title, body, delay } = event.data;
        
        setTimeout(() => {
            self.registration.showNotification(title, {
                body: body,
                icon: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
                badge: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
                vibrate: [200, 100, 200, 100, 200],
                tag: 'planner-alarm',
                renotify: true,
                requireInteraction: true
            });
        }, delay);
    }
});

// PAG-CLICK SA NOTIFICATION
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('./index.html');
        })
    );
});