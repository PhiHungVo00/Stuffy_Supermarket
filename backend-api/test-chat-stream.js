const { io } = require("socket.io-client");
const API_BASE = "http://localhost:5000";

async function runSocketTests() {
  console.log("=== STARTING SOCKET.IO CHAT & STREAM COMMENTARY TESTS ===");
  
  let socketA, socketB;
  
  try {
    // Connect client A
    console.log("Connecting Client A to Socket.IO...");
    socketA = io(API_BASE);
    
    // Connect client B
    console.log("Connecting Client B to Socket.IO...");
    socketB = io(API_BASE);

    await Promise.all([
      new Promise((resolve) => socketA.on("connect", resolve)),
      new Promise((resolve) => socketB.on("connect", resolve))
    ]);
    console.log("Both socket clients successfully connected to server.");

    // TEST 1: LIVE STREAM CHAT BROADCAST
    console.log("\n[Test 1] Testing Shopee Live Stream commentaries room...");
    const testShopId = "test_shop_123";
    
    socketA.emit("JOIN_LIVE_STREAM", testShopId);
    socketB.emit("JOIN_LIVE_STREAM", testShopId);
    
    const receiveCommentPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for stream comment")), 5000);
      
      socketB.on("RECEIVE_STREAM_COMMENT", (msg) => {
        clearTimeout(timeout);
        console.log(`Client B received stream comment: ${msg.userName}: "${msg.comment}"`);
        if (msg.userName === "Alice" && msg.comment === "Hello Stream viewers!") {
          resolve(msg);
        } else {
          reject(new Error("Received incorrect stream comment message details."));
        }
      });
    });

    // Send comment from Client A
    setTimeout(() => {
      console.log("Client A emitting stream comment...");
      socketA.emit("SEND_STREAM_COMMENT", {
        shopId: testShopId,
        userName: "Alice",
        comment: "Hello Stream viewers!"
      });
    }, 1000);

    const receivedComment = await receiveCommentPromise;
    console.log("Passed stream comment broadcast test.");

    // TEST 2: BUYER-SELLER PRIVATE CHAT BROADCAST
    console.log("\n[Test 2] Testing real-time direct user private messaging...");
    const userA_Id = "6a1aefb7363194aeff809a11";
    const userB_Id = "6a1aefb7363194aeff809a22";
    
    socketA.emit("JOIN_USER_ROOM", userA_Id);
    socketB.emit("JOIN_USER_ROOM", userB_Id);

    const receivePrivateMessagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for private chat message")), 5000);
      
      socketB.on("RECEIVE_MESSAGE", (msg) => {
        clearTimeout(timeout);
        console.log(`Client B (Seller) received message: sender=${msg.sender}, text="${msg.message}"`);
        if (msg.sender === userA_Id && msg.message === "How much is product X?") {
          resolve(msg);
        } else {
          reject(new Error("Received incorrect private message details."));
        }
      });
    });

    // Send private message from Client A to Client B
    setTimeout(() => {
      console.log("Client A (Buyer) sending private message...");
      socketA.emit("SEND_MESSAGE", {
        senderId: userA_Id,
        recipientId: userB_Id,
        message: "How much is product X?",
        shopId: "6a1aefb7363194aeff809a33"
      });
    }, 1000);

    const receivedPrivateMsg = await receivePrivateMessagePromise;
    console.log("Passed private buyer-seller chat broadcast test.");

    console.log("\n=== ALL SOCKET.IO INTEGRATION TESTS COMPLETED SUCCESSFULLY ===");
    socketA.disconnect();
    socketB.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("\n=== SOCKET.IO TEST FAILED ===");
    console.error(err);
    if (socketA) socketA.disconnect();
    if (socketB) socketB.disconnect();
    process.exit(1);
  }
}

runSocketTests();
