const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const serviceAccount = {
    type: process.env.SERVICE_ACCOUNT_TYPE,
    project_id: process.env.SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    private_key: process.env.SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL,
    client_id: process.env.SERVICE_ACCOUNT_CLIENT_ID,
    auth_uri: process.env.SERVICE_ACCOUNT_AUTH_URI,
    token_uri: process.env.SERVICE_ACCOUNT_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
    universe_domain: process.env.SERVICE_ACCOUNT_UNIVERSE_DOMAIN,
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});


// Initialize Firestore
const db = admin.firestore();

/**
 * 📌 Fetch all valid FCM tokens from Firestore
 */
async function getValidTokens() {
    const tokensSnapshot = await db.collection("tokens").get();
    return tokensSnapshot.docs.map(doc => ({ id: doc.id, token: doc.data().token }));
}

/**
 * 📌 Remove invalid FCM tokens from Firestore
 */
async function removeInvalidTokens(invalidTokenIds) {
    if (invalidTokenIds.length === 0) return;

    const batch = db.batch();
    invalidTokenIds.forEach(id => batch.delete(db.collection("tokens").doc(id)));
    await batch.commit();

    console.log(`🗑️ Removed ${invalidTokenIds.length} invalid tokens`);
}

/**
 * 📌 API to send notifications to all users
 */
app.post("/send-notification", async (req, res) => {
    const { title, body } = req.body;

    try {
        const tokenDocs = await getValidTokens();
        const tokens = tokenDocs.map(t => t.token);

        if (tokens.length === 0) {
            return res.status(400).json({ error: "No valid FCM tokens found" });
        }

        const message = {
            data: { title, body },
            tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        // Identify and remove invalid tokens
        const invalidTokenIds = tokenDocs
            .filter((_, index) => !response.responses[index].success &&
                response.responses[index].error.code === "messaging/registration-token-not-registered")
            .map(t => t.id);

        await removeInvalidTokens(invalidTokenIds);

        res.json({ success: true, sent: response.successCount, failed: response.failureCount });
    } catch (error) {
        console.error("🚨 Error sending notification:", error);
        res.status(500).json({ error: "Failed to send notification" });
    }
});

/**
 * 📌 Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
