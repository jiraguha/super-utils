#!/usr/bin/env -S deno run --allow-read --allow-run

// deno-pulumi-env.ts
// This script reads a .env file and sets Pulumi configuration
// Handles #@secret annotations to mark secrets
// Converts UPPER_SNAKE_CASE to camelCase for Pulumi config names

// Read the .env file manually to handle comments
async function readEnvFile(filePath = ".env") {
    try {
      const text = await Deno.readTextFile(filePath);
      const lines = text.split("\n");
      
      const env: Record<string, string> = {};
      const secrets: Set<string> = new Set();
      
      let nextLineIsSecret = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) continue;
        
        // Check for secret annotation
        if (trimmedLine === "#@secret") {
          nextLineIsSecret = true;
          continue;
        }
        
        // Skip other comments
        if (trimmedLine.startsWith("#")) continue;
        
        // Parse key-value pairs
        const match = trimmedLine.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          
          env[key] = value;
          
          if (nextLineIsSecret) {
            secrets.add(key);
            nextLineIsSecret = false;
          }
        }
      }
      
      return { env, secrets };
    } catch (error) {
      console.error(`Error reading .env file: ${error.message}`);
      return { env: {}, secrets: new Set() };
    }
  }
  
  // Convert UPPER_SNAKE_CASE to camelCase
  function toCamelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  // Function to execute pulumi config command
  async function setPulumiConfig(key: string, value: string, secret: boolean = false, dryRun: boolean = false) {
    // Convert key to camelCase for Pulumi
    const camelKey = toCamelCase(key);
    
    // If in dry run mode, just log what would happen
    if (dryRun) {
      console.log(`[DRY RUN] Would set ${secret ? "secret" : "plain"} config: ${camelKey}=${value} (from ${key})`);
      return true;
    }
    
    const cmd = ["pulumi", "config", "set", camelKey, value];
    
    // Add --secret flag if the value should be secret
    if (secret) {
      cmd.push("--secret");
    }
    
    console.log(`Setting ${secret ? "secret" : "plain"} config: ${camelKey} (from ${key})`);
    
    const process = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
    });
    
    const { code } = await process.status();
    
    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      console.error(`Failed to set config ${camelKey}: ${errorOutput}`);
    }
    
    process.close();
    
    return code === 0;
  }
  
  // Main function
  async function main() {
    // Parse command line arguments
    const args = Deno.args;
    let envFile = ".env";
    let dryRun = false;
    let skipCamelCase = false;
    
    // Check for arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("--env-file=")) {
        envFile = args[i].replace("--env-file=", "");
      } else if (args[i] === "--dry-run") {
        dryRun = true;
      } else if (args[i] === "--no-camel-case") {
        skipCamelCase = true;
      }
    }
    
    if (dryRun) {
      console.log("=== DRY RUN MODE - No commands will be executed ===");
    }
    
    if (skipCamelCase) {
      console.log("=== USING ORIGINAL VARIABLE NAMES (camelCase conversion disabled) ===");
    } else {
      console.log("=== CONVERTING NAMES TO CAMEL CASE ===");
    }
    
    // Read the environment variables and secrets
    const { env, secrets } = await readEnvFile(envFile);
    
    if (Object.keys(env).length === 0) {
      console.error("No environment variables found. Exiting.");
      Deno.exit(1);
    }
    
    console.log(`Found ${Object.keys(env).length} environment variables (${secrets.size} secrets)`);
    
    // Process each environment variable
    for (const [key, value] of Object.entries(env)) {
      // Skip empty values
      if (!value) continue;
      
      // Check if this key is marked as a secret
      const isSecret = secrets.has(key);
      
      // Set the pulumi config (use original key if camelCase is disabled)
      if (skipCamelCase) {
        await setPulumiConfig(key, value, isSecret, dryRun);
      } else {
        await setPulumiConfig(key, value, isSecret, dryRun);
      }
    }
    
    if (dryRun) {
      console.log("=== DRY RUN COMPLETED - No changes were made ===");
    } else {
      console.log("All configurations set successfully!");
    }
  }
  
  // Run the main function
  if (import.meta.main) {
    main().catch(console.error);
  }