#!/bin/bash
# Auto-approve pipeline Bash (logs, extracts, preflight, credential probes).
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')
event=$(echo "$input" | jq -r '.hook_event_name // "PreToolUse"')
[ -z "$command" ] && exit 0

dangerous_command() {
  echo "$command" | grep -qE '(^|[;&|] *)(sudo|rm -rf|curl [^|]*\| *bash|wget )'
}

safe_file_redirect_targets() {
  local targets
  targets=$(echo "$command" | grep -oE '[12]?>>? [^;&|[:space:]]+' | sed -E 's/^[12]?>>? //')
  [ -z "$targets" ] && return 0
  while IFS= read -r target; do
    case "$target" in
      logs/*|/home/eventstorm1/news/logs/*|/dev/null|/dev/stdout|/dev/stderr) ;;
      *) return 1 ;;
    esac
  done <<< "$targets"
}

# Claude Code always prompts on multiline python3 -c with "#" after newline (path-validation bypass guard).
trusted_python_inline() {
  echo "$command" | grep -qE '^python3 -c ' || return 1
  dangerous_command && return 1
  echo "$command" | grep -qE '(subprocess\.|os\.system|shutil\.(rmtree|move)|open\([^)]*['\''"]w|exec\(|eval\()' && return 1
  echo "$command" | grep -qE '(\.env|secrets/|/etc/|Bearer |Authorization:)' && return 1
  echo "$command" | grep -q '/home/eventstorm1/news/' && return 0
  echo "$command" | grep -q '/home/' && return 1
  return 0
}

# Claude Code always prompts on `cd … && … > file` (path-resolution bypass guard).
trusted_project_cd_compound() {
  echo "$command" | grep -qE '^cd /home/eventstorm1/news( |$)' || return 1
  echo "$command" | grep -qE '^cd /home/eventstorm1/news && ' || return 1
  dangerous_command && return 1
  if echo "$command" | grep -qE '[12]?>>? '; then
    safe_file_redirect_targets || return 1
  fi
  return 0
}

pipeline_command() {
  if dangerous_command; then
    return 1
  fi
  trusted_project_cd_compound && return 0
  trusted_python_inline && return 0
  echo "$command" | grep -qE 'logs/pipeline-run-(north|national)-' && return 0
  echo "$command" | grep -qE '(^|[;&|\n] *)export RESILIENCE_OPEN_EXTRACT_PARALLEL=1' && return 0
  echo "$command" | grep -qE '(^|[;&|\n] *)mkdir -p (logs|/home/eventstorm1/news/logs)' && return 0
  echo "$command" | grep -qE '^for date in 20[0-9]{2}-[0-9]{2}-[0-9]{2}' && return 0
  echo "$command" | grep -qE 'business_modules/(resilience|pbo_report_muni|pool|whatsapp|social_media|news-sites|audio|signals_extraction)/' && return 0
  echo "$command" | grep -qE 'npm run (homefront-to-md|extract-signals|assess-signals|social-media:gather-daily|extract-observations)' && return 0
  echo "$command" | grep -qE '(^|[;&|\n] *)(ls|test) (articles-|signals/|business_modules/)' && return 0

  # ${VAR:+SET} probes — print SET/MISSING only, never secret values
  if echo "$command" | grep -qE '\$\{[A-Z][A-Z0-9_]*:\+SET\}' && \
     ! echo "$command" | grep -qE '(\.env|Bearer |Authorization:|curl |wget |cat )'; then
    return 0
  fi

  # Pipeline status echoes (section headers, dry-run notes, exit codes)
  if echo "$command" | grep -qE '(Social:|Preflight:|Sources enabled|dry-run|Fetching news|Running north|RE-extract|=== (PBO|extract|WhatsApp)|exit: \$)'; then
  if ! echo "$command" | grep -qE '(^|[;&|\n] *)(node|npm|python|curl|rm |cat \.env)'; then
      return 0
    fi
  fi

  return 1
}

if ! pipeline_command; then
  exit 0
fi

if [ "$event" = "PermissionRequest" ]; then
  suggestions=$(echo "$input" | jq -c '.permission_suggestions // []')
  if [ "$suggestions" != "[]" ] && [ "$suggestions" != "null" ]; then
    jq -n --argjson perms "$suggestions" '{
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: {
          behavior: "allow",
          updatedPermissions: $perms
        }
      }
    }'
  else
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
  fi
else
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
fi

exit 0
