#!/usr/bin/env -S deno run --allow-run --allow-env --allow-net

import { parse } from "https://deno.land/std/flags/mod.ts";
import Kia from "https://deno.land/x/kia@0.4.1/mod.ts";



// Simple function to execute AWS CLI commands
async function awsCommand(args: string[], withOutput: boolean = true): Promise<any> {
  const cmd = ["aws", ...args];
  
  const process = Deno.run({
    cmd,
    stdout: "piped",
    stderr: "piped",
  });
  
  const [status, stdout, stderr] = await Promise.all([
    process.status(),
    process.output(),
    process.stderrOutput(),
  ]);
  process.close();
  
  if (!status.success) {
    throw new Error(`AWS CLI error: ${new TextDecoder().decode(stderr)}`);
  }
  
  if (!withOutput) {
    return;
  }
  return JSON.parse(new TextDecoder().decode(stdout));
}

// Function to get current public IP address
async function getCurrentPublicIP(): Promise<string> {
  try {
    const response = await fetch("https://checkip.amazonaws.com");
    if (!response.ok) {
      throw new Error(`Failed to get IP: ${response.status}`);
    }
    const ip = (await response.text()).trim();
    return `${ip}/32`; // Format as CIDR with /32 for single IP
  } catch (error) {
    throw new Error(`Error getting public IP: ${error.message}`);
  }
}

// Validates if a string is a valid CIDR notation
function isValidCIDR(cidr: string): boolean {
  // Simple regex for CIDR notation validation
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!cidrRegex.test(cidr)) {
    return false;
  }
  
  // Check IP part is valid
  const ipPart = cidr.split('/')[0];
  const octets = ipPart.split('.');
  
  for (const octet of octets) {
    const num = parseInt(octet, 10);
    if (num < 0 || num > 255) {
      return false;
    }
  }
  
  // Check prefix length is valid
  const prefixLength = parseInt(cidr.split('/')[1], 10);
  if (prefixLength < 0 || prefixLength > 32) {
    return false;
  }
  
  return true;
}

// Function to update EKS cluster public access CIDRs
async function updateEKSPublicAccessCIDRs(clusterName: string, region: string, ipsToAdd: string[], isClean: boolean = false, clear: boolean = false) {
  try {
    console.log(`Updating public access CIDRs for EKS cluster: ${clusterName} in region: ${region}`);
    

    
  
    let existingCIDRs = [];
    // Create a set to avoid duplicates
    if (isClean || clear) {
        console.log("Cleaning existing CIDRs...");
    }
    else {
        // Get existing public access CIDRs
        const clusterDetails = await awsCommand([
        "eks", "describe-cluster",
        "--region", region,
        "--name", clusterName
        ]);
        existingCIDRs = clusterDetails.cluster.resourcesVpcConfig.publicAccessCidrs || [];
        console.log(`Existing public access CIDRs: ${JSON.stringify(existingCIDRs)}`);
    }
    const cidrSet = new Set(existingCIDRs);
    
    // Add all IPs to the set
    let addedIPs: string[] = [];
    for (const ip of ipsToAdd) {
      if (!cidrSet.has(ip)) {
        cidrSet.add(ip);
        addedIPs.push(ip);
      }
    }
    
    // If no new IPs were added
    if (addedIPs.length === 0 && !clear) {
      console.log("All specified IPs are already in the public access CIDRs list.");
      return;
    }
    
    console.log(`Adding the following IPs: ${JSON.stringify(addedIPs)}`);
    
    // Convert set back to array
    const combinedCIDRs = Array.from(cidrSet);
    console.log(`New public access CIDRs: ${JSON.stringify(combinedCIDRs)}`);
    const updateResult = await (async () => {
        // Update cluster with combined CIDRs
        if (!clear) {
            return await awsCommand([
                "eks", "update-cluster-config",
                "--region", region,
                "--name", clusterName,
                "--resources-vpc-config", `endpointPublicAccess=true,endpointPrivateAccess=true,publicAccessCidrs=${combinedCIDRs.join(",")}`
            ]);
        }
        else {
            return await awsCommand([
                "eks", "update-cluster-config",
                "--region", region,
                "--name", clusterName,
                "--resources-vpc-config", "endpointPublicAccess=false,endpointPrivateAccess=true",
            ]);
        }
    })();

    
    console.log("Update initiated successfully!");
    console.log(`Update ID: ${updateResult.update.id}`);
    console.log(`Status: ${updateResult.update.status}`);
    console.log("\nYou can check the status of this update with:");
    console.log(`aws eks describe-update --region ${region} --name ${clusterName} --update-id ${updateResult.update.id}`);
    
  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

// Main function
async function main() {
  // Parse command line arguments
  const args = parse(Deno.args, {
    string: ["cluster-name", "region", "ips"],
    boolean: ["help", "clean", "clear"],
    alias: {
      "cluster-name": ["name","n", "cluster"],
      "region": ["r"],
      "ips": ["i", "ip"],
      "help": ["h"]
    },
    default: {
      "region": Deno.env.get("AWS_REGION") || Deno.env.get("AWS_DEFAULT_REGION")
    }
  });
  
  // Show help
  if (args.help || !args["cluster-name"]) {
    console.log(`
Usage: ./update-eks-cidrs.ts --cluster-name <name> [options]

Options:
  --cluster-name, -n, name, --cluster  EKS cluster name (required)
  --region, -r                   AWS region (optional, defaults to AWS_REGION env var)
  --ips, -i, --ip                Comma-separated list of IPs in CIDR format (optional)
                                 If not provided, your current public IP will be used
  --clean                    Clean existing CIDRs (optional)
  --help, -h                     Show this help message

Examples:
  Add current IP:
    ./update-eks-cidrs.ts --cluster-name my-eks-cluster

  Add current IP with specific region:
    ./update-eks-cidrs.ts --cluster-name my-eks-cluster --region us-east-1

  Add specific IPs:
    ./update-eks-cidrs.ts --cluster-name my-eks-cluster --ips "203.0.113.0/24,198.51.100.0/24"

  Add specific IPs with region:
    ./update-eks-cidrs.ts --cluster-name my-eks-cluster --region us-east-1 --ips "203.0.113.0/24,198.51.100.0/24"
`);
    Deno.exit(0);
  }
  
  const clean = args.clean;
  const clear = args.clear;
  const clusterName = args["cluster-name"];
  
  // Check if region is provided, otherwise use default
  const region = args.region;
  if (!region) {
    console.error("Error: AWS region not provided and not found in environment variables.");
    console.error("Please specify a region with --region or set AWS_REGION environment variable.");
    Deno.exit(1);
  }
  
  // Determine which IPs to add
  let ipsToAdd: string[] = [];
  
  // If IPs are provided, use them
  if (clear){
    console.log("Cleaning all existing CIDRs...");
  }
  if (args.ips && !clear) {
    const providedIPs = args.ips.split(",").map(ip => ip.trim());
    
    // Validate each IP
    for (const ip of providedIPs) {
      if (!isValidCIDR(ip)) {
        console.error(`Error: Invalid CIDR format: ${ip}`);
        console.error("IPs must be in CIDR format (e.g., 203.0.113.0/24)");
        Deno.exit(1);
      }
    }
    
    ipsToAdd = providedIPs;
    console.log(`Using provided IPs: ${JSON.stringify(ipsToAdd)}`);
  } else if (!clear) {
    // Otherwise get current IP
    console.log("No IPs provided, using current public IP...");
    const currentIP = await getCurrentPublicIP();
    console.log(`Current public IP: ${currentIP}`);
    ipsToAdd = [currentIP];
  }
  
  // Update the EKS cluster
  await updateEKSPublicAccessCIDRs(clusterName, region, ipsToAdd, clean, clear);

  // wait with spinner until ACTIVE
  const spinner = new Kia(
        `Waiting for EKS cluster ${clusterName} to become ACTIVE…`
      );
  spinner.start();

  await awsCommand([
    "eks", "wait", "cluster-active",
    "--name", clusterName,
    "--region", region,
  ], false);
  spinner.succeed(`Cluster ${clusterName} is now ACTIVE`);
}

await main();