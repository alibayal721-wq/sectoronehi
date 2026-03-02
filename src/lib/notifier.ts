import * as admin from 'firebase-admin';
import express from 'express';
import { decryptMessage } from './crypto';

// 1. Initialize Express (For Render to stay awake)
const app = express();
const PORT = Number(process.env.PORT) || 10000;

app.get('/', (_req, res) => res.send('SECTOR_ONE Notifier is ALIVE 📡'));
app.listen(PORT, '0.0.0.0', () => console.log(`🌍 Health Check server on port ${PORT}`));

// 2. Initialize Firebase Admin
// Make sure service-account.json is in your root folder!
const serviceAccount = require('../../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const fcm = admin.messaging();

console.log("🚀 SECTOR_ONE Notification Engine Started...");

// Watch ALL channels for new messages
db.collectionGroup('messages').onSnapshot(async (snapshot: admin.firestore.QuerySnapshot) => {
    snapshot.docChanges().forEach(async (change: admin.firestore.DocumentChange) => {
        if (change.type === 'added') {
            const msg = change.doc.data();
            const timestamp = msg.timestamp?.toDate();

            // Only process messages sent in the last 1 minute
            if (!timestamp || Date.now() - timestamp.getTime() > 60000) return;

            console.log(`📡 New Transmission from ${msg.username} in #${msg.channel_id}`);

            // Get all registered device tokens
            const tokenSnap = await db.collection('user_tokens').get();
            const tokens = tokenSnap.docs
                .map((doc: admin.firestore.QueryDocumentSnapshot) => doc.data().token)
                .filter((t: any) => t && t !== 'null' && typeof t === 'string' && t.length > 10);

            if (tokens.length === 0) return;

            // Send the Push
            const decryptedContent = decryptMessage(msg.content);
            const messagePayload = {
                notification: {
                    title: `[SECTOR_ONE] ${msg.username.toUpperCase()}`,
                    body: msg.type === 'text' ? decryptedContent : `[${msg.type.toUpperCase()} Attached]`,
                },
                tokens: tokens,
            };

            try {
                await fcm.sendEachForMulticast(messagePayload);
                console.log(`✅ Push Broadcasted to devices.`);
            } catch (err) {
                console.error("❌ Send error:", err);
            }
        }
    });
});
