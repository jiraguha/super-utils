#!/usr/bin/env -S deno run --allow-run --allow-env

// Simple function to execute AWS CLI commands
async function awsCommand(args: string[]): Promise<any> {
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
  
  return JSON.parse(new TextDecoder().decode(stdout));
}

async function main() {
  try {
    console.log("Listing ECS images and versions...\n");
    
    // 1. Get all clusters
    const clusters = await awsCommand(["ecs", "list-clusters"]);
    if (!clusters.clusterArns || clusters.clusterArns.length === 0) {
      console.log("No ECS clusters found.");
      return;
    }
    
    // Table headers
    console.log("CLUSTER".padEnd(20) + "SERVICE".padEnd(30) + "CONTAINER".padEnd(25) + "IMAGE".padEnd(50) + "TAG");
    console.log("-".repeat(130));
    
    // 2. Process each cluster
    for (const clusterArn of clusters.clusterArns) {
      const clusterName = clusterArn.split("/").pop() || clusterArn;
      
      // 3. Get services for this cluster
      const services = await awsCommand(["ecs", "list-services", "--cluster", clusterArn]);
      
      if (!services.serviceArns || services.serviceArns.length === 0) {
        continue;
      }
      
      // 4. Process services in batches (AWS API limit is 10)
      for (let i = 0; i < services.serviceArns.length; i += 10) {
        const serviceBatch = services.serviceArns.slice(i, i + 10);
        
        // Convert array to space-delimited string for AWS CLI
        const servicesString = serviceBatch.join(" ");
        
        // 5. Get details for each service
        const serviceDetails = await awsCommand([
          "ecs", "describe-services", 
          "--cluster", clusterArn, 
          "--services", ...serviceBatch
        ]);
        
        // 6. Process each service
        for (const service of serviceDetails.services) {
          const serviceName = service.serviceName;
          
          if (!service.taskDefinition) {
            continue;
          }
          
          // 7. Get task definition details
          const taskDef = await awsCommand([
            "ecs", "describe-task-definition",
            "--task-definition", service.taskDefinition
          ]);
          
          // 8. Process each container in the task definition
          if (taskDef.taskDefinition && taskDef.taskDefinition.containerDefinitions) {
            for (const container of taskDef.taskDefinition.containerDefinitions) {
              // Parse image and tag
              let imageName = container.image || "";
              let imageTag = "latest";
              
              if (imageName.includes(":")) {
                const parts = imageName.split(":");
                imageTag = parts.pop() || "latest";
                imageName = parts.join(":");
              }
              
              // Print in table format
              console.log(
                clusterName.padEnd(20) +
                serviceName.padEnd(30) +
                (container.name || "").padEnd(25) +
                imageName.padEnd(50) + ":" +
                imageTag
              );
            }
          }
        }
      }
    }
    
    console.log("\nDone!");
    
  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

await main();