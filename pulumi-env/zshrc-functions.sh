# Pulumi Env Config Functions for .zshrc
# Add these functions to your .zshrc file

# Function to set Pulumi config from .env file
pulumi_env() {
  # Default values
  local env_file=${1:-.env}
  local dry_run=${2:-false}
  local no_camel_case=${3:-false}
  
  # Check if pulumi is installed
  if ! command -v pulumi &> /dev/null; then
    echo "Error: Pulumi CLI is not installed."
    echo "Please install it from: https://www.pulumi.com/docs/get-started/install/"
    return 1
  fi
  
  # Build command with appropriate flags
  local cmd_args=""
  
  if [[ "$env_file" != ".env" ]]; then
    cmd_args="$cmd_args --env-file=$env_file"
  fi
  
  if [[ "$dry_run" == "true" ]]; then
    cmd_args="$cmd_args --dry-run"
  fi
  
  if [[ "$no_camel_case" == "true" ]]; then
    cmd_args="$cmd_args --no-camel-case"
  fi
  
  echo "Setting Pulumi config from $env_file file..."
  
  # Run the Deno script directly from URL (or use local version if preferred)
  deno run --allow-read --allow-run https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/pulumi-env/index.ts $cmd_args
}

# Function for dry-run mode
pulumi_env_dry() {
  # Default to .env if no file is specified
  local env_file=${1:-.env}
  
  echo "Dry run: testing Pulumi config from $env_file..."
  pulumi_env "$env_file" true false
}

# Function for no camel case mode
pulumi_env_raw() {
  # Default to .env if no file is specified
  local env_file=${1:-.env}
  local dry_run=${2:-false}
  
  echo "Using raw variable names (no camelCase conversion)..."
  pulumi_env "$env_file" "$dry_run" true
}

# Add autocompletion for env files
_pulumi_env_complete() {
  local env_files
  local dry_run_options
  
  # If completing the first argument, suggest env files in current directory
  if [[ $CURRENT -eq 2 ]]; then
    env_files=($(ls -1 | grep -E '\.env.*$'))
    _describe 'env files' env_files
  # If completing the second argument for pulumi_env
  elif [[ $CURRENT -eq 3 && $words[1] == "pulumi_env" ]]; then
    dry_run_options=("true" "false")
    _describe 'dry run' dry_run_options
  # If completing the third argument for pulumi_env
  elif [[ $CURRENT -eq 4 && $words[1] == "pulumi_env" ]]; then
    camel_case_options=("true" "false")
    _describe 'camel case' camel_case_options
  # If completing the second argument for pulumi_env_raw
  elif [[ $CURRENT -eq 3 && $words[1] == "pulumi_env_raw" ]]; then
    dry_run_options=("true" "false")
    _describe 'dry run' dry_run_options
  fi
}

# Register completion functions
compdef _pulumi_env_complete pulumi_env pulumi_env_dry pulumi_env_raw

# Add aliases for convenience
alias penv='pulumi_env'
alias penvd='pulumi_env_dry'
alias penvr='pulumi_env_raw'

# Set default values (uncomment and customize as needed)
# export PULUMI_DEFAULT_ENV_FILE=".env.production"