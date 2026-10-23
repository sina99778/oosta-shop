// Test environment — imported FIRST by each test file, because src/config/env
// parses process.env once at import time.
import { randomBytes } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.PAYMENT_PROVIDER = "mock";
process.env.CARD_TO_CARD_ENABLED = "true";
process.env.CARD_NUMBER = "6037991234567890";
process.env.MAX_OPEN_ORDERS_PER_USER = "3";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
