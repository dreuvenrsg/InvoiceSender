#!/usr/bin/env bash
# Ship the current code to the running RSG AI EC2 host:
# build arm64 image -> push to ECR -> SSM command pulls + restarts compose.
set -euo pipefail

REGION=${AWS_REGION:-us-west-1}
NAME=rsg-ai
REPO=rsg-ai
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
TAG="arm64-$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${ECR}/${REPO}:${TAG}"

cd "$(dirname "$0")/../.."

INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=${NAME}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "No running ${NAME} instance found — run deploy/ec2/launch.sh first." >&2
  exit 1
fi

echo "==> Building + pushing ${IMAGE}"
docker build --platform linux/arm64 -t "$IMAGE" .
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR"
docker push "$IMAGE"

echo "==> Updating ${INSTANCE_ID} (image + config files)"
COMPOSE_B64=$(base64 < deploy/ec2/docker-compose.yml | tr -d '\n')
CADDY_B64=$(base64 < deploy/ec2/Caddyfile | tr -d '\n')
RUN_B64=$(base64 < deploy/ec2/run.sh | tr -d '\n')
CMD_ID=$(aws ssm send-command --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "rsg-ai deploy ${TAG}" \
  --parameters "commands=[\"echo ${IMAGE} > /opt/rsg-ai/image\",\"echo ${COMPOSE_B64} | base64 -d > /opt/rsg-ai/docker-compose.yml\",\"echo ${CADDY_B64} | base64 -d > /opt/rsg-ai/Caddyfile\",\"echo ${RUN_B64} | base64 -d > /opt/rsg-ai/run.sh\",\"chmod +x /opt/rsg-ai/run.sh\",\"/opt/rsg-ai/run.sh\",\"sleep 5\",\"curl -sf http://localhost:8787/healthz\"]" \
  --query Command.CommandId --output text)

aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" || true
STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" \
  --query Status --output text)
echo "==> Deploy status: ${STATUS}"
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" \
  --query StandardOutputContent --output text | tail -5
[ "$STATUS" = "Success" ]
