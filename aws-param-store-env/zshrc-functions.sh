# AWS Parameter Store Env Config Functions for .zshrc
# Add these functions to your .zshrc file

# Base alias to run the script from URL
alias aws-param-store-env="deno run --allow-read --allow-run --allow-env https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/aws-param-store-env/index.ts"

# No convenience aliases without stack parameter since it's mandatory
# Instead, use the environment-specific aliases that include the stack parameter

# Enhanced completion for aws-param-store-env commands
_aws_param_store_env_complete() {
  local state
  local -a env_files stacks

  _arguments -C \
    '--env-file=[Specify an environment file]:env file:->env_files' \
    '--dry-run[Test without making changes]' \
    '--stack=[AWS Parameter Store path prefix]:stack:->stacks' \
    '*:env file:->env_files'

  case $state in
    env_files)
      # Find all .env* files in current directory
      env_files=($(ls -1 | grep -E '\.env.*$' 2>/dev/null))
      if [[ ${#env_files} -eq 0 ]]; then
        # If no .env files found, suggest creating one
        _message "No .env files found. Create one first."
      else
        # Show available .env files with descriptions
        local -a env_file_descriptions
        for file in $env_files; do
          # Add description based on filename
          case $file in
            .env.production|production.env)
              env_file_descriptions+=("$file:Production environment")
              ;;
            .env.staging|staging.env)
              env_file_descriptions+=("$file:Staging environment")
              ;;
            .env.development|development.env|.env.dev|dev.env)
              env_file_descriptions+=("$file:Development environment")
              ;;
            .env.local|local.env)
              env_file_descriptions+=("$file:Local environment")
              ;;
            .env)
              env_file_descriptions+=("$file:Default environment")
              ;;
            *)
              env_file_descriptions+=("$file:Custom environment")
              ;;
          esac
        done
        _describe -t env_files "Environment files" env_file_descriptions
      fi
      ;;
    stacks)
      # Common stack paths or suggest recently used ones
      # Could be dynamically generated from AWS if needed
      stacks=(
        "myapp/prod:Production environment"
        "myapp/staging:Staging environment"
        "myapp/dev:Development environment"
        "shared/common:Shared parameters"
      )

      # Add recently used stacks from history if available
      if [[ -f ~/.aws_param_store_history ]]; then
        local recent_stacks=($(cat ~/.aws_param_store_history | sort | uniq | tail -5))
        for stack in $recent_stacks; do
          stacks+=("$stack:Recently used")
        done
      fi

      _describe -t stacks "Parameter Store stacks" stacks
      ;;
  esac
}

# Register completion
compdef _aws_param_store_env_complete aws-param-store-env apsenv apsenvd

# Function to save used stack to history
_save_stack_to_history() {
  local stack=""

  # Extract stack name from arguments
  for arg in "$@"; do
    if [[ $arg == --stack=* ]]; then
      stack=${arg#--stack=}
      break
    fi
  done

  # Save to history file if stack was provided
  if [[ -n "$stack" ]]; then
    mkdir -p ~/.aws_param_store
    echo "$stack" >> ~/.aws_param_store_history
  fi
}

# Wrapper function with stack history
aws_param_store_env() {
  aws-param-store-env "$@"
  _save_stack_to_history "$@"
}

# Environment-specific wrapper functions
aws_param_store_dev() {
  local env_file=${1:-.env}
  local dry_run=${2:-false}

  local args="--stack=myapp/dev --env-file=$env_file"

  if [[ "$dry_run" == "true" ]]; then
    args="$args --dry-run"
  fi

  aws-param-store-env $=args
  _save_stack_to_history "--stack=myapp/dev"
}

aws_param_store_staging() {
  local env_file=${1:-.env}
  local dry_run=${2:-false}

  local args="--stack=myapp/staging --env-file=$env_file"

  if [[ "$dry_run" == "true" ]]; then
    args="$args --dry-run"
  fi

  aws-param-store-env $=args
  _save_stack_to_history "--stack=myapp/staging"
}

aws_param_store_prod() {
  local env_file=${1:-.env}
  local dry_run=${2:-false}

  local args="--stack=myapp/prod --env-file=$env_file"

  if [[ "$dry_run" == "true" ]]; then
    args="$args --dry-run"
  fi

  aws-param-store-env $=args
  _save_stack_to_history "--stack=myapp/prod"
}

# Shorter aliases for environment-specific functions
alias apsenv-dev="aws_param_store_dev"
alias apsenv-staging="aws_param_store_staging"
alias apsenv-prod="aws_param_store_prod"

# Print usage info for the command
aws_param_store_help() {
  echo "AWS Parameter Store Env Config - Set SSM parameters from .env files"
  echo "Security-first approach: All variables are treated as secrets by default."
  echo
  echo "Usage:"
  echo "  apsenv-dev [file] [dry_run]    Set parameters in myapp/dev stack"
  echo "  apsenv-staging [file] [dry_run] Set parameters in myapp/staging stack"
  echo "  apsenv-prod [file] [dry_run]   Set parameters in myapp/prod stack"
  echo
  echo "Options:"
  echo "  --env-file=FILE                Specify an environment file (default: .env)"
  echo "  --dry-run                      Test without making changes"
  echo "  --stack=STACK                  Parameter Store path prefix (required, e.g., myapp/dev)"
  echo
  echo "Examples:"
  echo "  aws-param-store-env --stack=myapp/dev   # Use default .env file for dev stack"
  echo "  aws-param-store-env --env-file=prod.env --stack=myapp/prod  # Use prod.env for production stack"
  echo "  aws-param-store-env --stack=myapp/dev --dry-run  # Dry run for development stack"
  echo "  apsenv-prod production.env     # Use production.env for production stack"
  echo "  apsenv-dev .env true           # Dry run for development stack with .env file"
  echo
  echo "File format:"
  echo "  # All variables are SecureString by default"
  echo "  API_KEY=your-secret-key"
  echo "  # For non-sensitive values, use #@notSecured"
  echo "  #@notSecured"
  echo "  DEBUG=false"
}

# Alias for help
alias apsenvh="aws_param_store_help"