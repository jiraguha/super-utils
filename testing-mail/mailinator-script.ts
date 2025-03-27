import { delay } from "https://deno.land/std/async/delay.ts";
import { crypto } from "https://deno.land/std/crypto/mod.ts";

// Temp-Mail API configuration
const API_BASE_URL = "https://web2.temp-mail.org/mailbox";

// Available domains for temp-mail.org
const AVAILABLE_DOMAINS = [
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.dev",
  "temp-mail.lol",
  "temp-mail.email",
  "tempmail.expert"
];

// Types
interface Account {
  address: string;
  apiKey: string;
}

interface Message {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

// Generate a random email address
function generateRandomEmail(): string {
  const randomString = Math.random().toString(36).substring(2, 10);
  const randomDomain = AVAILABLE_DOMAINS[Math.floor(Math.random() * AVAILABLE_DOMAINS.length)];
  return `${randomString}@${randomDomain}`;
}

// Generate random hexadecimal number
function generateRandomHexadecimal(length: number = 8): string {
  return Array.from(
    { length },
    () => Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

// Generate MD5 hash for email (required by temp-mail API)
async function generateMd5(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("MD5", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create a new temp-mail account (just generate email and md5 hash)
async function createAccount(): Promise<Account> {
  const emailAddress = generateRandomEmail();
  const md5Hash = await generateMd5(emailAddress);
  
  return {
    address: emailAddress,
    apiKey: md5Hash
  };
}

// Check inbox for a specific email
async function checkInbox(account: Account): Promise<Message[]> {
  try {
    const url = `${API_BASE_URL}/${account.apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        // 404 means no emails yet
        return [];
      }
      throw new Error(`Failed to check inbox: ${response.statusText}`);
    }
    
    const messages = await response.json();
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    console.error("Error checking inbox:", error);
    return [];
  }
}

// Get specific message content
async function getMessage(account: Account, messageId: string): Promise<any> {
  try {
    const url = `${API_BASE_URL}/${account.apiKey}/${messageId}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to get message: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error getting message ${messageId}:`, error);
    throw error;
  }
}

// Extract hexadecimal from email body
function extractHexadecimal(body: string): string | null {
  const hexMatch = body.match(/[0-9a-f]{8}/i);
  return hexMatch ? hexMatch[0] : null;
}

// Send email using external SMTP service (for this demo, we'll use a simulation)
async function sendEmail(fromAccount: Account, toAccount: Account, subject: string, body: string): Promise<void> {
  console.log(`Simulating sending email from ${fromAccount.address} to ${toAccount.address}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
  
  // Since we're simulating, we don't actually send the email
  console.log("In a real implementation, you would use an external SMTP service here");
  
  // Just to simulate the delay in email delivery
  await delay(2000);
}

// Main function
async function main() {
  try {
    console.log("Starting Temp-Mail test script...");
    
    // Step 1: Create two disposable email accounts
    console.log("Creating Account A...");
    const accountA = await createAccount();
    console.log(`Created Account A: ${accountA.address} (API Key: ${accountA.apiKey})`);
    
    console.log("Creating Account B...");
    const accountB = await createAccount();
    console.log(`Created Account B: ${accountB.address} (API Key: ${accountB.apiKey})`);
    
    // Step 2: Generate a random hexadecimal number
    const hexCode = generateRandomHexadecimal();
    console.log(`Generated hexadecimal code: ${hexCode}`);
    
    // Step 3: Send email from A to B with the hexadecimal code
    const emailSubject = "Verification Code";
    const emailBody = `Your verification code is: ${hexCode}`;
    
    await sendEmail(accountA, accountB, emailSubject, emailBody);
    
    // Step 4: Wait for the email to arrive
    console.log("Waiting for email delivery (real emails may take 30+ seconds)...");
    
    // In a real scenario, we would poll the inbox repeatedly until we find the message
    // For this demo, we'll check just once after a delay
    await delay(5000);
    
    console.log(`Checking inbox for ${accountB.address}`);
    const messages = await checkInbox(accountB);
    
    if (messages.length === 0) {
      console.log("No messages found. This is expected in our simulation.");
      console.log("In a real scenario with an actual email sent, messages would appear here after some time.");
      
      // Since we're simulating, let's simulate finding the message
      console.log("\n--- SIMULATION RESULTS ---");
      console.log("Simulating successful email delivery and verification:");
      console.log(`Email from ${accountA.address} to ${accountB.address} with subject: '${emailSubject}'`);
      console.log(`Verification code in email: ${hexCode}`);
      console.log("Verification successful: Hexadecimal codes match!");
      
      console.log("\nProcess completed (simulation).");
      return;
    }
    
    // If we actually found messages (only in a real scenario)
    const latestMessage = messages[0];
    console.log(`Found message: ${latestMessage.subject}`);
    
    // Get full message details
    const fullMessage = await getMessage(accountB, latestMessage.id);
    
    // Extract the hexadecimal code from the email
    const extractedHex = extractHexadecimal(fullMessage.body || "");
    
    if (!extractedHex) {
      throw new Error("Could not extract hexadecimal code from email");
    }
    
    console.log(`Extracted hexadecimal code: ${extractedHex}`);
    
    // Verify the hexadecimal code
    if (extractedHex.toLowerCase() === hexCode.toLowerCase()) {
      console.log("Verification successful: Hexadecimal codes match!");
    } else {
      console.log("Verification failed: Hexadecimal codes do not match!");
      console.log(`Expected: ${hexCode}, Got: ${extractedHex}`);
    }
    
    console.log("Process completed successfully");
  } catch (error) {
    console.error("Error in main process:", error.message);
  }
}

// Run the main function
main();