import { delay } from "https://deno.land/std/async/delay.ts";

// Configuration
const API_BASE_URL = "https://api.mail.tm";
const POLL_INTERVAL_MS = 5000; // Check for new emails every 5 seconds
const MAX_RETRIES = 3; // Maximum number of retries for API calls

// Types
interface Domain {
  id: string;
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

interface Account {
  id: string;
  address: string;
  password: string;
  token: string;
}

interface Message {
  id: string;
  from: {
    address: string;
    name: string;
  };
  to: Array<{
    address: string;
    name: string;
  }>;
  subject: string;
  intro?: string;
  text?: string;
  html?: string;
  createdAt: string;
}

// Generate a random password
function generateRandomPassword(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Get available domains
async function getAvailableDomains(retryCount = 0): Promise<Domain[]> {
  try {
    console.log("Fetching available domains...");
    const response = await fetch(`${API_BASE_URL}/domains`);
    
    if (!response.ok) {
      throw new Error(`Failed to get domains: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check for the expected response format from Mail.tm
    if (data["hydra:member"] && Array.isArray(data["hydra:member"]) && data["hydra:member"].length > 0) {
      console.log(`Found ${data["hydra:member"].length} domains.`);
      return data["hydra:member"];
    } else {
      throw new Error("No domains available in the response");
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`Error fetching domains: ${error.message}. Retrying in 3 seconds...`);
      await delay(3000);
      return getAvailableDomains(retryCount + 1);
    }
    console.error("Error fetching domains:", error);
    throw error;
  }
}

// Create a new account
async function createAccount(domainName: string): Promise<Account> {
  const username = Math.random().toString(36).substring(2, 10);
  const email = `${username}@${domainName}`;
  const password = generateRandomPassword();
  
  console.log(`Creating account with email: ${email}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: email,
        password: password,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create account: ${response.statusText}`);
    }
    
    const account = await response.json();
    const token = await getToken(email, password);
    
    return {
      id: account.id,
      address: email,
      password: password,
      token: token,
    };
  } catch (error) {
    console.error(`Error creating account with ${email}:`, error);
    throw error;
  }
}

// Get authentication token
async function getToken(email: string, password: string): Promise<string> {
  try {
    console.log("Getting authentication token...");
    const response = await fetch(`${API_BASE_URL}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: email,
        password: password,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error getting token:", error);
    throw error;
  }
}

// Get messages for an account
async function getMessages(token: string): Promise<Message[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/messages`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data["hydra:member"] || [];
  } catch (error) {
    console.error("Error getting messages:", error);
    return [];
  }
}

// Get a specific message
async function getMessage(token: string, messageId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE_URL}/messages/${messageId}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get message: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error getting message ${messageId}:`, error);
    throw error;
  }
}

// Delete a message
async function deleteMessage(token: string, messageId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/messages/${messageId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.statusText}`);
    }
    
    console.log(`Message ${messageId} deleted`);
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error);
    throw error;
  }
}

// Format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

// Truncate text to a certain length
function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

// Format message for display
function formatMessage(message: any, detailed = false): string {
  const messageText = message.text || message.intro || (message.html ? "HTML content (not displayed)" : "");
  
  if (detailed) {
    return `
--------------------------------------------------
From: ${message.from.name} <${message.from.address}>
Subject: ${message.subject}
Time: ${formatDate(message.createdAt)}
--------------------------------------------------
${messageText}
--------------------------------------------------
`;
  } else {
    return `[${formatDate(message.createdAt)}] From: ${message.from.address.padEnd(30)} | Subject: ${message.subject.padEnd(40)} | ${truncateText(messageText, 50)}`;
  }
}

// Clear console (cross-platform)
function clearConsole(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("\x1Bc"));
}

// Display a help message
function displayHelp(): void {
  console.log("\nCommands:");
  console.log("  help - Display this help message");
  console.log("  clear - Clear the console");
  console.log("  quit or exit - Exit the program");
  console.log("  delete <ID> - Delete a message by its ID");
  console.log("  refresh - Force refresh the inbox");
  console.log("");
}

// Handle user commands
async function handleCommand(command: string, account: Account, forceRefresh: { value: boolean }): Promise<boolean> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  
  switch (cmd) {
    case "help":
      displayHelp();
      return true;
    case "clear":
      clearConsole();
      console.log(`Email Tail Monitor - Monitoring: ${account.address}`);
      displayHelp();
      return true;
    case "quit":
    case "exit":
      return false;
    case "refresh":
      forceRefresh.value = true;
      console.log("Refreshing inbox...");
      return true;
    case "delete":
      if (parts.length < 2) {
        console.log("Error: Please specify a message ID to delete");
        return true;
      }
      const id = parts[1];
      await deleteMessage(account.token, id);
      return true;
    default:
      console.log(`Unknown command: ${cmd}`);
      displayHelp();
      return true;
  }
}

// Set up user input handling
async function setupCommandLine(account: Account, forceRefresh: { value: boolean }): Promise<void> {
  const buf = new Uint8Array(1024);
  const textDecoder = new TextDecoder();
  
  // Display initial help
  displayHelp();
  
  // Process stdin
  while (true) {
    Deno.stdout.writeSync(new TextEncoder().encode("> "));
    const n = await Deno.stdin.read(buf);
    if (n === null) {
      break;
    }
    
    const command = textDecoder.decode(buf.subarray(0, n)).trim();
    const shouldContinue = await handleCommand(command, account, forceRefresh);
    
    if (!shouldContinue) {
      console.log("Exiting...");
      Deno.exit(0);
    }
  }
}

// Main email tail function
async function tailEmails(account: Account) {
  console.log(`\nMonitoring inbox for: ${account.address}`);
  console.log("Type 'help' for available commands\n");
  
  // Object to track forced refreshes
  const forceRefresh = { value: false };
  
  // Set up command-line interface in a separate thread
  setupCommandLine(account, forceRefresh);
  
  let seenMessageIds = new Set<string>();
  let firstRun = true;
  
  // Continuously poll for new messages
  while (true) {
    try {
      const messages = await getMessages(account.token);
      
      // On first run, just record existing messages without displaying them
      if (firstRun) {
        messages.forEach(message => seenMessageIds.add(message.id));
        firstRun = false;
        console.log(`Found ${messages.length} existing emails. Waiting for new emails...`);
      } else if (forceRefresh.value) {
        // If force refresh is requested, show all messages again
        console.log(`Refreshed. Found ${messages.length} emails in inbox.`);
        
        for (const message of messages) {
          if (!seenMessageIds.has(message.id)) {
            // Get full message details only for new messages
            try {
              const fullMessage = await getMessage(account.token, message.id);
              console.log(formatMessage(fullMessage, true));
              console.log(`Message ID: ${message.id} (use 'delete ${message.id}' to delete)`);
              
              seenMessageIds.add(message.id);
            } catch (error) {
              console.error(`Error getting full message ${message.id}:`, error.message);
              // Still mark it as seen even if we couldn't get details
              seenMessageIds.add(message.id);
            }
          }
        }
        
        forceRefresh.value = false;
      } else {
        // Check for new messages
        const newMessages = messages.filter(message => !seenMessageIds.has(message.id));
        
        // Display new messages
        if (newMessages.length > 0) {
          for (const message of newMessages) {
            // Get full message details
            try {
              const fullMessage = await getMessage(account.token, message.id);
              console.log(formatMessage(fullMessage, true));
              console.log(`Message ID: ${message.id} (use 'delete ${message.id}' to delete)`);
              
              seenMessageIds.add(message.id);
            } catch (error) {
              console.error(`Error getting full message ${message.id}:`, error.message);
              // Still mark it as seen even if we couldn't get details
              seenMessageIds.add(message.id);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking for new emails:", error.message);
    }
    
    // Wait before checking again
    await delay(POLL_INTERVAL_MS);
  }
}

// Main function
async function main() {
  try {
    clearConsole();
    console.log("Mail.tm Email Tail Monitor - Create disposable email and monitor for new messages\n");
    
    // Step 1: Get available domains
    const domains = await getAvailableDomains();
    console.log(`Using domain: ${domains[0].domain}`);
    
    // Step 2: Create a disposable email account
    console.log("Creating a disposable email account...");
    const account = await createAccount(domains[0].domain);
    
    clearConsole();
    console.log("Mail.tm Email Tail Monitor - Created disposable email account\n");
    console.log(`Your disposable email address: ${account.address}`);
    console.log(`Password: ${account.password}`);
    console.log(`Token: ${account.token.substring(0, 10)}...`); // Show only part of the token for security
    
    console.log("\nYou can also access this inbox via the web interface:");
    console.log(`https://mail.tm/en`);
    console.log(`Login with your email (${account.address}) and password (${account.password})`);
    
    console.log("\nShare this address to receive emails and see them appear in real-time below.");
    
    // Step 3: Start tailing emails
    console.log("\nChecking for messages in tail mode...");
    await tailEmails(account);
    
  } catch (error) {
    console.error("Error in main process:", error.message);
    Deno.exit(1);
  }
}

// Run the main function
if (import.meta.main) {
  main();
}