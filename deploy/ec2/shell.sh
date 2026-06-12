#!/usr/bin/env bash
# Shell access to the RSG AI EC2 host via SSM (no SSH keys, IAM-audited).
#
#   bash deploy/ec2/shell.sh                          # interactive shell (humans)
#   bash deploy/ec2/shell.sh 'docker logs --tail 50 rsg-ai-rsg-ai-1'   # one-shot (agents)
#
# One-shot mode runs the command remotely and prints stdout/stderr — ideal
# for Claude Code sessions debugging the box. Interactive mode requires the
# session-manager-plugin (brew install --cask session-manager-plugin).
#
# Useful one-shots:
#   docker ps                                  # container status
#   docker logs --tail 100 rsg-ai-rsg-ai-1     # agent API logs (audit JSONL)
#   docker logs --tail 50 rsg-ai-caddy-1       # TLS / proxy logs
#   cat /var/log/rsg-ai-init.log               # first-boot provisioning log
#   /opt/rsg-ai/run.sh                         # force re-pull + restart
set -euo pipefail

REGION=${AWS_REGION:-us-west-1}
INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=rsg-ai" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "No running rsg-ai instance found." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  exec aws ssm start-session --target "$INSTANCE_ID" --region "$REGION"
fi

CMD_ID=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands":[sys.argv[1]]}))' "$*")" \
  --query Command.CommandId --output text)

STATUS=InProgress
while [ "$STATUS" = "InProgress" ] || [ "$STATUS" = "Pending" ]; do
  sleep 2
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --region "$REGION" --query Status --output text)
done

aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" \
  --query StandardOutputContent --output text
ERR=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" \
  --query StandardErrorContent --output text)
[ -n "$ERR" ] && [ "$ERR" != "None" ] && echo "--- stderr ---" >&2 && echo "$ERR" >&2
[ "$STATUS" = "Success" ]
