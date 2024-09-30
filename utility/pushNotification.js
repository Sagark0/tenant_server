const { Expo } = require("expo-server-sdk");


async function sendPushNotification(expoPushToken) {
  const message = {
    to: expoPushToken,
    sound: "default",
    title: "Original Title",
    body: "And here is the body!",
    data: { someData: "goes here" },
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

async function sendBulkPushNotification(pushTokens, body, title) {
    let expo = new Expo();
    let messages = [];
    for (let pushToken of pushTokens) {
      messages.push({
        to: pushToken,
        sound: "default",
        title,
        body,
      });
    }
    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
  
    (async () => {
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          console.log(ticketChunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error(error);
        }
      }
    })();
  
    let receiptIds = [];
    for (let ticket of tickets) {
      if (ticket.status === "ok") {
        receiptIds.push(ticket.id);
      }
    }
  
    let receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    (async () => {
      for (let chunk of receiptIdChunks) {
        try {
          let receipts = await expo.getPushNotificationReceiptsAsync(chunk);
          console.log(receipts);
  
          for (let receiptId in receipts) {
            let { status, message, details } = receipts[receiptId];
            if (status === "ok") {
              continue;
            } else if (status === "error") {
              console.error(`There was an error sending a notification: ${message}`);
              if (details && details.error) {
                console.error(`The error code is ${details.error}`);
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    })();
}

module.exports = {sendPushNotification, sendBulkPushNotification}