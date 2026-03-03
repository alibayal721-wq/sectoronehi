const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const fmessaging = admin.messaging();

/**
 * Triggered when a new message is added to ANY channel or DM.
 * Uses collectionGroup to watch all 'messages' subcollections.
 */
exports.sendPushNotification = functions.firestore
    .document('{collectionId}/{docId}/messages/{messageId}')
    .onCreate(async (snapshot, context) => {
        const msg = snapshot.data();
        const collectionId = context.params.collectionId; // 'channels' or 'dms'

        try {
            let recipientTokens = [];

            if (collectionId === 'dms') {
                // Direct Message: Send to the specific receiver
                if (msg.receiver_id) {
                    const tokenDoc = await db.collection('user_tokens').doc(msg.receiver_id).get();
                    if (tokenDoc.exists) {
                        recipientTokens.push(tokenDoc.data().token);
                    }
                }
            } else if (collectionId === 'channels') {
                // Channel Message: Send to everyone except the sender
                const tokensSnap = await db.collection('user_tokens').get();
                tokensSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.userId !== msg.user_id && data.token) {
                        recipientTokens.push(data.token);
                    }
                });
            }

            if (recipientTokens.length > 0) {
                const cleanMessage = (msg.content && msg.content.startsWith('SØ_'))
                    ? '[ШИФРОВАННОЕ СООБЩЕНИЕ]'
                    : msg.content;

                const payload = {
                    notification: {
                        title: collectionId === 'dms' ? `[ПРЯМАЯ СВЯЗЬ] ${msg.username}` : `[#КАНАЛ] ${msg.username}`,
                        body: msg.type === 'text' ? cleanMessage : `[${msg.type.toUpperCase()}]`,
                        icon: '/icon-192.png',
                    },
                    data: {
                        type: 'NEW_MESSAGE',
                        channelId: msg.channel_id || '',
                        senderId: msg.user_id || '',
                        click_action: 'FLUTTER_NOTIFICATION_CLICK' // For consistency
                    }
                };

                // Send to all detected tokens
                const response = await fmessaging.sendToDevice(recipientTokens, payload, {
                    priority: 'high',
                    timeToLive: 60 * 60 * 24 // 24 hours
                });

                console.log(`Successfully sent ${response.successCount} notifications for message ${context.params.messageId}`);
            }
        } catch (error) {
            console.error('Error sending push notification:', error);
        }
    });
