import { Redis } from "ioredis";

async function clearRedisData() {
  const redis = new Redis();
  try {
    console.log("Clearing Redis data...");
    await redis.flushall();
    console.log("Redis data cleared successfully.");
  } catch (error) {
    console.error("Error clearing Redis data:", error);
  } finally {
    await redis.quit();
  }
}

// Use this function before setting up the QA system
await clearRedisData();