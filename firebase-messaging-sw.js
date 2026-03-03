// SECTOR_ONE Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyC-Vvjj9WceA0G4NI_-iTs-U5sszezM8SY",
    authDomain: "sector-one-me.firebaseapp.com",
    projectId: "sector-one-me",
    storageBucket: "sector-one-me.firebasestorage.app",
    messagingSenderId: "155069202564",
    appId: "1:155069202564:web:1f4c9c82f46f746d7842d1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: payload.data?.tag || 'sector-one-msg',
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
