#!/bin/bash
# Runs ON the instance (installed to /opt/rsg-ai/run.sh by launch.sh's
# user-data). Pulls the image named in /opt/rsg-ai/image and (re)starts the
# compose stack. Used both at first boot and by deploy/ec2/update.sh.
set -euo pipefail

REGION=us-west-1
export IMAGE=$(cat /opt/rsg-ai/image)
export DOMAIN=$(cat /opt/rsg-ai/domain)
export RSG_AI_API_KEY=$(aws ssm get-parameter --name /rsg-ai/prod/api-key \
  --with-decryption --query Parameter.Value --output text --region "$REGION")

ECR_HOST=${IMAGE%%/*}
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_HOST"

docker compose -f /opt/rsg-ai/docker-compose.yml pull
docker compose -f /opt/rsg-ai/docker-compose.yml up -d --remove-orphans
docker image prune -f >/dev/null
echo "rsg-ai running image: $IMAGE"
