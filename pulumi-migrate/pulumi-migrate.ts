#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env

/**
 * Pulumi Stack Migration Tool
 * 
 * A Deno CLI tool to migrate Pulumi stacks from Pulumi Cloud to an S3 backend.
 * 
 * Usage:
 *   deno run --allow-run --allow-read --allow-write --allow-env pulumi-migrate.ts \
 *     --stack=mystack \
 *     --bucket=my-pulumi-state-bucket \
 *     --region=us-west-2
 */

import { parse } from "https://deno.land/std/flags/mod.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import { ensureDir } from "https://deno.land/std/fs/mod.ts";
import { bgGreen, black, bold, red, yellow, green, blue } from "https://deno.land/std/fmt/colors.ts";

// Define command line arguments
const args = parse(Deno.args, {
  string: ["stack", "bucket", "region", "workspace", "encryption-key", "dynamodb-table"],
  boolean: ["help", "delete-source", "skip-verify", "verbose", "create-bucket", "create-dynamodb"],
  alias: {
    h: "help",
    s: "stack",
    b: "bucket",
    r: "region",
    w: "workspace",
    d: "delete-source",
    v: "verbose",
    k: "encryption-key",
    t: "dynamodb-table",
  },
  default: {
    region: Deno.env.get("AWS_REGION") || "eu-west-3",
    workspace: ".",
    "delete-source": false,
    "skip-verify": false,
    "create-bucket": true,
    "create-dynamodb": false,
    verbose: false
  }
});

/**
 * Display help information
 */
function showHelp() {
  console.log(`
${bold("Pulumi Stack Migration Tool")}

Migrates Pulumi stacks from Pulumi Cloud to an S3 backend.

${bold("USAGE:")}
  deno run --allow-run --allow-read --allow-write --allow-env pulumi-migrate.ts [OPTIONS]

${bold("OPTIONS:")}
  -h, --help                Show this help message
  -s, --stack=<name>        Stack name to migrate (required)
  -b, --bucket=<name>       S3 bucket name for backend storage (required)
  -r, --region=<region>     AWS region for S3 bucket (default: from AWS_REGION or eu-west-3)
  -w, --workspace=<path>    Path to Pulumi project (default: current directory)
  -d, --delete-source       Delete the source stack after successful migration
  --skip-verify             Skip verification step
  -v, --verbose             Enable verbose output
  -k, --encryption-key      Custom encryption key for secrets

${bold("EXAMPLES:")}
  deno run --allow-run --allow-read --allow-write --allow-env pulumi-migrate.ts \\
    --stack=dev \\
    --bucket=my-pulumi-state \\
    --region=us-west-2

  # Migrate all stacks in a project
  for STACK in $(pulumi stack ls --json | jq -r '.[].name'); do \\
    deno run --allow-run --allow-read --allow-write --allow-env pulumi-migrate.ts \\
      --stack=$STACK \\
      --bucket=my-pulumi-state
  done
`);
}

// Show help if requested or missing required arguments
if (args.help || !args.stack || !args.bucket) {
  showHelp();
  if (args.help) {
    Deno.exit(0);
  } else {
    console.error(red("Error: Missing required arguments (--stack and --bucket)"));
    Deno.exit(1);
  }
}

// Logging helper with verbosity control
function log(message: string, type: "info" | "success" | "warning" | "error" = "info") {
  const prefix = {
    info: blue("INFO:"),
    success: green("SUCCESS:"),
    warning: yellow("WARNING:"),
    error: red("ERROR:")
  }[type];
  
  console.log(`${prefix} ${message}`);
}

// Verbose logging helper
function logVerbose(message: string) {
  if (args.verbose) {
    console.log(`${blue("DEBUG:")} ${message}`);
  }
}

/**
 * Execute a shell command
 */
async function executeCommand(command: string[], options: { cwd?: string; silent?: boolean } = {}): Promise<{ output: string; success: boolean }> {
  const { cwd = ".", silent = false } = options;
  
  try {
    if (!silent || args.verbose) {
      log(`Executing: ${command.join(" ")}`);
    }

    const process = Deno.run({
      cmd: command,
      cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const [status, stdout, stderr] = await Promise.all([
      process.status(),
      process.output(),
      process.stderrOutput(),
    ]);

    process.close();

    const output = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    if (!status.success) {
      throw new Error(`Command failed with exit code ${status.code}: ${errorOutput}`);
    }

    if (args.verbose && errorOutput) {
      logVerbose(`Command stderr: ${errorOutput}`);
    }

    return { output: output.trim(), success: true };
  } catch (error) {
    if (!silent) {
      console.error(red(`Command execution failed: ${error.message}`));
    }
    return { output: error.message, success: false };
  }
}

/**
 * Check if Pulumi CLI is installed
 */
async function checkPulumiInstalled(): Promise<boolean> {
  try {
    const { output, success } = await executeCommand(["pulumi", "version"], { silent: true });
    return success;
  } catch (error) {
    return false;
  }
}

/**
 * Check if AWS CLI is correctly configured
 */
async function checkAwsConfiguration(): Promise<boolean> {
  try {
    // Simple check to see if AWS credentials are available
    const { success } = await executeCommand(["aws", "sts", "get-caller-identity"], { silent: true });
    return success;
  } catch (error) {
    return false;
  }
}

/**
 * Check if S3 bucket exists
 */
async function checkS3BucketExists(bucket: string, region: string): Promise<boolean> {
  try {
    const { success } = await executeCommand(
      ["aws", "s3api", "head-bucket", "--bucket", bucket, "--region", region],
      { silent: true }
    );
    return success;
  } catch (error) {
    return false;
  }
}

/**
 * Create S3 bucket with proper configuration for Pulumi state management
 */
async function createS3Bucket(bucket: string, region: string): Promise<boolean> {
  log(`Creating S3 bucket "${bucket}" in region "${region}" for Pulumi state...`);
  
  try {
    // 1. Create S3 bucket
    let createBucketCmd = ["aws", "s3api", "create-bucket", "--bucket", bucket, "--region", region];
    
    // Handle special case for us-east-1 (doesn't use LocationConstraint)
    if (region !== "us-east-1") {
      createBucketCmd.push("--create-bucket-configuration", `LocationConstraint=${region}`);
    }
    
    const { success: bucketCreated } = await executeCommand(createBucketCmd);
    if (!bucketCreated) {
      return false;
    }
    log(`S3 bucket created successfully`, "success");

    // 2. Enable versioning on the bucket
    log(`Enabling versioning on the bucket...`);
    const { success: versioningEnabled } = await executeCommand([
      "aws", "s3api", "put-bucket-versioning",
      "--bucket", bucket,
      "--versioning-configuration", "Status=Enabled",
      "--region", region
    ]);
    if (!versioningEnabled) {
      log(`Failed to enable versioning, but bucket was created`, "warning");
    }

    // 3. Enable default encryption on the bucket
    log(`Enabling default encryption on the bucket...`);
    const { success: encryptionEnabled } = await executeCommand([
      "aws", "s3api", "put-bucket-encryption",
      "--bucket", bucket,
      "--server-side-encryption-configuration", '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}',
      "--region", region
    ]);
    if (!encryptionEnabled) {
      log(`Failed to enable encryption, but bucket was created`, "warning");
    }

    // 4. Add lifecycle policy to manage old versions
    log(`Adding lifecycle policy for version management...`);
    const { success: lifecycleAdded } = await executeCommand([
      "aws", "s3api", "put-bucket-lifecycle-configuration",
      "--bucket", bucket,
      "--lifecycle-configuration", '{"Rules":[{"ID":"ExpireOldVersions","Status":"Enabled","NoncurrentVersionExpiration":{"NoncurrentDays":90}}]}',
      "--region", region
    ]);
    if (!lifecycleAdded) {
      log(`Failed to add lifecycle policy, but bucket was created`, "warning");
    }

    log(`S3 bucket "${bucket}" created and configured successfully for Pulumi state`, "success");
    return true;
  } catch (error) {
    log(`Failed to create S3 bucket: ${error.message}`, "error");
    return false;
  }
}

/**
 * Export the stack state from Pulumi Cloud
 */
async function exportStackState(stack: string, workspacePath: string): Promise<string | null> {
  const tempDir = join(Deno.cwd(), ".pulumi-migrate-temp");
  await ensureDir(tempDir);

  const stackName = stack.replaceAll("/","-")

  const statePath = join(tempDir, `${stackName}-state.json`);
  
  log(`Exporting stack state for "${stack}" to ${statePath}...`);
  
  const { success, output } = await executeCommand(
    ["pulumi", "stack", "export", "--stack", stack, "--file", statePath],
    { cwd: workspacePath }
  );

  if (!success) {
    log(`Failed to export stack state: ${output}`, "error");
    return null;
  }

  return statePath;
}

/**
 * Create DynamoDB table for state locking
 */
async function createDynamoDBTable(tableName: string, region: string): Promise<boolean> {
  log(`Creating DynamoDB table "${tableName}" in region "${region}" for Pulumi state locking...`);
  
  try {
    // 1. Create DynamoDB table
    const { success: tableCreated } = await executeCommand([
      "aws", "dynamodb", "create-table",
      "--table-name", tableName,
      "--attribute-definitions", "AttributeName=LockID,AttributeType=S",
      "--key-schema", "AttributeName=LockID,KeyType=HASH",
      "--provisioned-throughput", "ReadCapacityUnits=5,WriteCapacityUnits=5",
      "--region", region
    ]);
    
    if (!tableCreated) {
      return false;
    }
    
    log(`DynamoDB table created successfully`, "success");

    // 2. Enable point-in-time recovery
    log(`Enabling point-in-time recovery...`);
    const { success: recoveryEnabled } = await executeCommand([
      "aws", "dynamodb", "update-continuous-backups",
      "--table-name", tableName,
      "--point-in-time-recovery-specification", "PointInTimeRecoveryEnabled=true",
      "--region", region
    ]);
    
    if (!recoveryEnabled) {
      log(`Failed to enable point-in-time recovery, but table was created`, "warning");
    }

    log(`DynamoDB table "${tableName}" created and configured successfully for Pulumi state locking`, "success");
    return true;
  } catch (error) {
    log(`Failed to create DynamoDB table: ${error.message}`, "error");
    return false;
  }
}

/**
 * Check if DynamoDB table exists
 */
async function checkDynamoDBTableExists(tableName: string, region: string): Promise<boolean> {
  try {
    const { success } = await executeCommand(
      ["aws", "dynamodb", "describe-table", "--table-name", tableName, "--region", region],
      { silent: true }
    );
    return success;
  } catch (error) {
    return false;
  }
}

/**
 * Switch to S3 backend
 */
async function loginToS3Backend(bucket: string, region: string, dynamoDBTable?: string): Promise<boolean> {
  log(`Logging out from current Pulumi backend...`);
  await executeCommand(["pulumi", "logout"]);

  let loginUrl = `s3://${bucket}\?region=${region}`;
  
  // Add DynamoDB table if specified
  if (dynamoDBTable) {
    loginUrl += `&dynamodb_table=${dynamoDBTable}`;
  }

  log(`Logging into S3 backend: ${loginUrl}...`);
  const { success, output } = await executeCommand(
    ["pulumi", "login", loginUrl]
  );

  if (!success) {
    log(`Failed to login to S3 backend: ${output}`, "error");
    return false;
  }

  return true;
}

/**
 * Create a new stack in the S3 backend
 */
async function createStackInS3(stack: string, workspacePath: string): Promise<boolean> {
  log(`Creating stack "${stack}" in S3 backend...`);

  const [orgName, stackName] = stack.split('/');
  
  const { success, output } = await executeCommand(
    ["pulumi", "stack", "init", stackName, "--non-interactive"],
    { cwd: workspacePath }
  );

  if (!success) {
    log(`Failed to create stack in S3 backend: ${output}`, "error");
    return false;
  }

  return true;
}

/**
 * Import the stack state to the S3 backend
 */
async function importStackState(stack: string, statePath: string, workspacePath: string): Promise<boolean> {
  log(`Importing stack state from ${statePath}...`);
  
  const { success, output } = await executeCommand(
    ["pulumi", "stack", "import", "--stack", stack, "--file", statePath],
    { cwd: workspacePath }
  );

  if (!success) {
    log(`Failed to import stack state: ${output}`, "error");
    return false;
  }

  return true;
}

/**
 * Verify the migration by running pulumi up with no changes expected
 */
async function verifyMigration(stack: string, workspacePath: string): Promise<boolean> {
  log(`Verifying stack migration (expecting no changes)...`);
  
  const { success, output } = await executeCommand(
    ["pulumi", "preview", "--stack", stack, "--diff"],
    { cwd: workspacePath }
  );

  // Check if no changes were detected
  const noChanges = output.includes("no changes") || 
                    output.includes("0 resources to create") && 
                    output.includes("0 resources to update") && 
                    output.includes("0 resources to delete");

  if (!success || !noChanges) {
    log(`Verification failed: unexpected changes detected`, "warning");
    console.log(output);
    return false;
  }

  log(`Verification successful: no changes detected`, "success");
  return true;
}

/**
 * Delete the source stack from Pulumi Cloud
 */
async function deleteSourceStack(stack: string, workspacePath: string): Promise<boolean> {
  // First, we need to log back into Pulumi Cloud
  log(`Logging back into Pulumi Cloud...`);
  await executeCommand(["pulumi", "logout"]);
  await executeCommand(["pulumi", "login"]);
  
  log(`Removing source stack "${stack}" from Pulumi Cloud...`);
  
  // Force deletion with --yes
  const { success, output } = await executeCommand(
    ["pulumi", "stack", "rm", "--stack", stack, "--yes"],
    { cwd: workspacePath }
  );

  if (!success) {
    log(`Failed to delete source stack: ${output}`, "error");
    return false;
  }

  log(`Source stack "${stack}" successfully deleted`, "success");
  return true;
}

/**
 * Clean up temporary files
 */
async function cleanUpTempFiles(): Promise<void> {
  const tempDir = join(Deno.cwd(), ".pulumi-migrate-temp");
  try {
    await Deno.remove(tempDir, { recursive: true });
    logVerbose(`Cleaned up temporary directory: ${tempDir}`);
  } catch (error) {
    logVerbose(`Failed to clean up temporary directory: ${error.message}`);
  }
}

/**
 * Main migration function
 */
async function migrateStack() {
  console.log(bgGreen(black(` PULUMI STACK MIGRATION TOOL `)));
  console.log();
  
  // Initial checks
  log("Checking prerequisites...");
  const pulumiInstalled = await checkPulumiInstalled();
  
  if (!pulumiInstalled) {
    log("Pulumi CLI is not installed or not in PATH", "error");
    console.log(`Please install Pulumi CLI: https://www.pulumi.com/docs/install/`);
    Deno.exit(1);
  }
  
  const awsConfigured = await checkAwsConfiguration();
  if (!awsConfigured) {
    log("AWS credentials are not properly configured", "warning");
    console.log(`This might cause issues when accessing the S3 bucket. Make sure AWS credentials are set up correctly.`);
  }

  // Extract arguments
  const { 
    stack, 
    bucket, 
    region, 
    workspace, 
    "delete-source": deleteSource, 
    "skip-verify": skipVerify,
    "create-bucket": createBucketIfNotExists,
    "create-dynamodb": createDynamoDBIfNotExists,
    "dynamodb-table": dynamoDBTable
  } = args;
  
  // Check if S3 bucket exists and create if needed
  const bucketExists = await checkS3BucketExists(bucket, region);
  if (!bucketExists) {
    if (createBucketIfNotExists) {
      log(`S3 bucket "${bucket}" doesn't exist, creating it...`);
      const bucketCreated = await createS3Bucket(bucket, region);
      if (!bucketCreated) {
        log(`Failed to create S3 bucket. Please create it manually or check your permissions.`, "error");
        Deno.exit(1);
      }
    } else {
      log(`S3 bucket "${bucket}" doesn't exist and --create-bucket is disabled.`, "error");
      log(`Please create the bucket manually or enable automatic creation with --create-bucket.`, "error");
      Deno.exit(1);
    }
  }
  
  // Check if DynamoDB table exists and create if needed
  if (dynamoDBTable) {
    const tableExists = await checkDynamoDBTableExists(dynamoDBTable, region);
    if (!tableExists) {
      if (createDynamoDBIfNotExists) {
        log(`DynamoDB table "${dynamoDBTable}" doesn't exist, creating it...`);
        const tableCreated = await createDynamoDBTable(dynamoDBTable, region);
        if (!tableCreated) {
          log(`Failed to create DynamoDB table. Please create it manually or check your permissions.`, "error");
          log(`Continuing without state locking...`, "warning");
        }
      } else {
        log(`DynamoDB table "${dynamoDBTable}" doesn't exist and --create-dynamodb is disabled.`, "warning");
        log(`Continuing without state locking...`, "warning");
      }
    }
  }
  
  // Migration steps
  let backendUrl = `s3://${bucket}?region=${region}`;
  if (dynamoDBTable) {
    backendUrl += `&dynamodb_table=${dynamoDBTable}`;
  }
  
  log(`Starting migration of stack "${stack}" to backend: ${backendUrl}...`, "info");
  
  // 1. Export stack state
  const statePath = await exportStackState(stack, workspace);
  if (!statePath) {
    Deno.exit(1);
  }
  
  // 2. Login to S3 backend
  const s3LoginSuccess = await loginToS3Backend(bucket, region, dynamoDBTable);
  if (!s3LoginSuccess) {
    Deno.exit(1);
  }
  
  // 3. Create stack in S3
  const stackCreateSuccess = await createStackInS3(stack, workspace);
  if (!stackCreateSuccess) {
    Deno.exit(1);
  }
  
  // 4. Import stack state
  const importSuccess = await importStackState(stack, statePath, workspace);
  if (!importSuccess) {
    Deno.exit(1);
  }
  
  // 5. Verify migration
  if (!skipVerify) {
    const verificationSuccess = await verifyMigration(stack, workspace);
    if (!verificationSuccess) {
      log("Migration verification failed. The stack state may not be identical.", "warning");
      log("You can still proceed but may need to manually resolve any discrepancies.", "warning");
      
      // Ask for confirmation to continue
      console.log();
      console.log("Do you want to continue with the migration? (y/N)");
      const response = prompt("") || "n";
      
      if (response.toLowerCase() !== "y") {
        log("Migration aborted by user", "warning");
        await cleanUpTempFiles();
        Deno.exit(1);
      }
    } else {
      log("Migration verification successful", "success");
    }
  } else {
    log("Skipping verification step as requested", "warning");
  }
  
  // 6. Delete source stack if requested
  if (deleteSource) {
    const deleteSuccess = await deleteSourceStack(stack, workspace);
    if (!deleteSuccess) {
      log("Failed to delete source stack, but migration was successful", "warning");
    }
  }
  
  // 7. Clean up
  await cleanUpTempFiles();
  
  log(`Stack "${stack}" successfully migrated to backend: ${backendUrl}`, "success");
  console.log();
  
  // Final instructions
  console.log(`${bold("Next steps:")}
1. Confirm your stack is working correctly by running: ${green("pulumi stack select " + stack)}
2. Verify your infrastructure with: ${green("pulumi preview")}
3. Update any CI/CD pipelines to use the new backend URL: ${green(backendUrl)}
`);
}

// Run the migration
await migrateStack();