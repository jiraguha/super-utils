#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

// aws-param-store-env.ts
// This script reads a .env file and sets AWS Parameter Store values
// Handles #@secret annotations to mark SecureString parameters

// Read the .env file manually to handle comments
async function readEnvFile(filePath = ".env") {
  try {
    const text = await Deno.readTextFile(filePath);
    const lines = text.split("\n");

    const env: Record<string, string> = {};
    const nonSecrets: Set<string> = new Set();

    let nextLineNotSecured = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Check for notSecured annotation
      if (trimmedLine === "#@notSecured") {
        nextLineNotSecured = true;
        continue;
      }

      // Skip other comments
      if (trimmedLine.startsWith("#")) continue;

      // Parse key-value pairs
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        env[key] = value;

        if (nextLineNotSecured) {
          nonSecrets.add(key);
          nextLineNotSecured = false;
        }
      }
    }

    return { env, nonSecrets };
  } catch (error) {
    console.error(`Error reading .env file: ${error.message}`);
    return { env: {}, nonSecrets: new Set() };
  }
}

// Function to execute AWS Parameter Store put command
async function setParameterStoreValue(key: string, value: string, secret: boolean = false, stack: string = "", dryRun: boolean = false) {
  // Create the full parameter name with stack prefix if provided
  const paramName = stack ? `/${stack}/${key}` : `/${key}`;

  // Determine parameter type based on whether it's a secret
  const paramType = secret ? "SecureString" : "String";

  // If in dry run mode, just log what would happen
  if (dryRun) {
    console.log(`[DRY RUN] Would set ${paramType} parameter: ${paramName}=${value}`);
    return true;
  }

  const cmd = [
    "aws", "ssm", "put-parameter",
    "--name", paramName,
    "--value", value,
    "--type", paramType,
    "--overwrite"
  ];

  console.log(`Setting ${paramType} parameter: ${paramName}`);

  const process = Deno.run({
    cmd,
    stdout: "piped",
    stderr: "piped",
  });

  const { code } = await process.status();
  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(await process.stderrOutput());
    console.error(`Failed to set parameter ${paramName}: ${errorOutput}`);
  } else {
    try {
      const stdout = await process.output();
      const output = new TextDecoder().decode(stdout);
      if (output && output.trim()) {
        const result = JSON.parse(output);
        console.log(`  Success! Version: ${result.Version}`);
      } else {
        console.log(`  Success!`);
      }
    } catch (error) {
      // If we can't parse the output, just show success
      console.log(`  Success! ${error}`);
    }
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
  let stack = "";

  // Check for arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--env-file=")) {
      envFile = args[i].replace("--env-file=", "");
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i].startsWith("--stack=")) {
      stack = args[i].replace("--stack=", "");
    }
  }

  // Check if stack is provided (mandatory)
  if (!stack) {
    console.error("Error: --stack parameter is required.");
    console.error("Example: --stack=myapp/dev");
    Deno.exit(1);
  }

  if (dryRun) {
    console.log("=== DRY RUN MODE - No parameters will be set ===");
  }

  if (stack) {
    console.log(`=== USING STACK PREFIX: /${stack}/ ===`);
  }

  // Check if AWS CLI is installed
  try {
    const process = Deno.run({
      cmd: ["aws", "--version"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code } = await process.status();
    process.close();

    if (code !== 0) {
      console.error("AWS CLI is not properly installed or configured.");
      Deno.exit(1);
    }
  } catch (error) {
    console.error("AWS CLI is not installed. Please install AWS CLI first.");
    Deno.exit(1);
  }

  // Read the environment variables and non-secrets
  const { env, nonSecrets } = await readEnvFile(envFile);

  if (Object.keys(env).length === 0) {
    console.error("No environment variables found. Exiting.");
    Deno.exit(1);
  }

  console.log(`Found ${Object.keys(env).length} environment variables (${nonSecrets.size} non-secrets, ${Object.keys(env).length - nonSecrets.size} secrets)`);

  // Process each environment variable
  let successCount = 0;
  let failCount = 0;

  for (const [key, value] of Object.entries(env)) {
    // Skip empty values
    if (!value) continue;

    // Check if this key is marked as non-secret
    const isSecret = !nonSecrets.has(key);

    // Set the parameter
    const success = await setParameterStoreValue(key, value, isSecret, stack, dryRun);

    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  if (dryRun) {
    console.log("=== DRY RUN COMPLETED - No changes were made ===");
  } else {
    console.log(`=== COMPLETED ===`);
    console.log(`Successfully set ${successCount} parameters`);

    if (failCount > 0) {
      console.log(`Failed to set ${failCount} parameters`);
    }
  }
}

// Run the main function
if (import.meta.main) {
  main().catch(console.error);
}