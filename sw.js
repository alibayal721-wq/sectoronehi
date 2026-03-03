// SECTOR ONE — Service Worker
// Handles background notifications via the Notification API

const CACHE_NAME = 'sector-one-v1';

// Install event
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Listen for messages from main app to show notifications
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, tag } = event.data;
        event.waitUntil(
            self.registration.showNotification(title, {
                body,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                tag: tag || 'sector-one-msg',
                vibrate: [200, 100, 200],
                requireInteraction: false,
                renotify: true,
            })
        );
    }

    if (event.data && event.data.type === 'SHOW_CALL_NOTIFICATION') {
        const { callerName } = event.data;
        event.waitUntil(
            self.registration.showNotification('📞 ВХОДЯЩИЙ ЗВОНОК', {
                body: `${callerName} вызывает вас...`,
                icon: 'icon-192.png',
                badge: 'icon-192.png',
                tag: 'sector-one-call',
                vibrate: [500, 200, 500, 200, 500, 200, 500],
                requireInteraction: true,
                renotify: true,
                actions: [
                    { action: 'answer', title: '✅ Ответить' },
                    { action: 'reject', title: '❌ Отклонить' }
                ]
            })
        );
    }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // Focus existing window or open new
            for (const client of clients) {
                if (client.url.includes('sectoronehi') && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow('/sectoronehi/');
        })
    );
});
