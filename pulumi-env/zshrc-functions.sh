# Pulumi Env Config Functions for .zshrc
# Add these functions to your .zshrc file

# Function to configure Pulumi from .env file
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
  
  echo "Setting Pulumi config from $env_file file..."
  
  # Build command with appropriate flags
  local cmd="pulumi-env"
  
  if [[ "$env_file" != ".env" ]]; then
    cmd="$cmd --env-file=$env_file"
  fi
  
  if [[ "$dry_run" == "true" ]]; then
    cmd="$cmd --dry-run"
  fi
  
  if [[ "$no_camel_case" == "true" ]]; then
    cmd="$cmd --no-camel-case"
  fi
  
  # Run the command
  eval "$cmd"
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

# Completion function for pulumi_env commands
_pulumi_env_complete() {
  local env_files
  local curr_word=$words[CURRENT]
  
  # If completing the first argument, suggest env files in current directory
  if [[ $CURRENT -eq 2 ]]; then
    env_files=($(ls -1 | grep -E '\.env.*$'))
    _describe 'env files' env_files
  # If completing the second argument for pulumi_env
  elif [[ $CURRENT -eq 3 && $words[1] == "pulumi_env" ]]; then
    _values 'dry run' true false
  # If completing the third argument for pulumi_env
  elif [[ $CURRENT -eq 4 && $words[1] == "pulumi_env" ]]; then
    _values 'camel case' true false
  # If completing the second argument for pulumi_env_raw
  elif [[ $CURRENT -eq 3 && $words[1] == "pulumi_env_raw" ]]; then
    _values 'dry run' true false
  fi
}

# Register completion function
compdef _pulumi_env_complete pulumi_env pulumi_env_dry pulumi_env_raw

# Aliases for convenience
alias penv='pulumi_env'
alias penvd='pulumi_env_dry'
alias penvr='pulumi_env_raw'

# Usage examples:
# penv                  # Use default .env file with camelCase conversion
# penv prod.env         # Use prod.env file with camelCase conversion
# penvd                 # Dry run with default .env file
# penvd staging.env     # Dry run with staging.env file
# penvr                 # Use default .env file without camelCase conversion
# penvr prod.env true   # Dry run with prod.env file without camelCase conversion