const { Expo } = require("expo-server-sdk");
const { JWT } = require("google-auth-library");
const { getMessaging } = require("firebase-admin/messaging");

function getAccessTokenAsync() {
  const key = require(process.env.FCM_SERVER_KEY);
  return new Promise(function (resolve, reject) {
    const jwtClient = new JWT(
      key.client_email,
      null,
      key.private_key,
      ["https://www.googleapis.com/auth/firebase.messaging"],
      null
    );
    jwtClient.authorize(function (err, tokens) {
      if (err) {
        reject(err);
        return;
      }
      resolve(tokens.access_token);
    });
  });
}

async function sendFCMv1NotificationAPI(firebaseAccessToken, deviceToken, body, title) {
  const messageBody = {
    message: {
      token: deviceToken,
      // data: {
      //   channelId: "default",
      //   message: "Testing",
      //   title: `This is an FCM notification message`,
      //   body: JSON.stringify({ title: "bodyTitle", body: "bodyBody" }),
      //   scopeKey: "@light0/user",
      //   experienceId: "@light0/user",
      // },
      notification: {
        body,
        title
      }
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/tenants-2fe0b/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firebaseAccessToken}`,
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
    }
  );

  const readResponse = (response) => response.json();
  const json = await readResponse(response);
  console.log(`Response JSON: ${JSON.stringify(json, null, 2)}`);
  return json;
}

async function sendBulkPushNotification(registrationTokens, title, body) {
  const firebaseAccessToken = await getAccessTokenAsync();
  const responses = []
  for( let deviceToken of registrationTokens) {
    const response = await sendFCMv1NotificationAPI(firebaseAccessToken, deviceToken, title, body)
    responses.push(response);
  }
  return responses
}

async function sendFCMv1Notification() {
  const firebaseAccessToken = await getAccessTokenAsync();
  console.log("Access Token", firebaseAccessToken);
  const registrationToken =
    "cLHzO_OgRQOd6VlANwd0yY:APA91bENwyudRdq18JvZ44NOUVw--67LNY6AZJp7QkJHPC9taWCTE6nfSWxdAdek17M6zwrBToGuV-y190CbjV5L7P6tRgEMG_-WCry7c_N8iGlyg_bVOxovy_CqUtyLsZy7Fy__xpiG";

  // This registration token comes from the client FCM SDKs.

  const message = {
    notification: {
      body: "This is an FCM Notification",
      title: "FCM Message",
    },
    data: {
      score: "850",
      time: "2:45",
    },
    token: registrationToken,
  };

  getMessaging()
    .send(message)
    .then((response) => {
      // Response is a message ID string.
      console.log("Successfully sent message:", response);
    })
    .catch((error) => {
      console.log("Error sending message:", error);
    });
}

module.exports = {
  sendBulkPushNotification,
  sendFCMv1Notification,
  getAccessTokenAsync,
};
