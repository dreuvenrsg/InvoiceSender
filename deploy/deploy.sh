#!/usr/bin/env bash
# Build + deploy the RSG AI agent API to ECS Fargate (us-west-1).
#
#   npm run rsg-ai:deploy                       # full build + push + stack deploy
#   CERT_ARN=arn:aws:acm:... npm run rsg-ai:deploy   # with HTTPS listener
#
# Optional env: VPC_ID, SUBNET_IDS (comma-separated), CERT_ARN, RSG_AI_MODEL.
# Defaults: default VPC and its subnets are auto-discovered.
set -euo pipefail

REGION=${AWS_REGION:-us-west-1}
STACK=rsg-ai-service
REPO=rsg-ai
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
IMAGE="${ECR}/${REPO}:${TAG}"

cd "$(dirname "$0")/.."

echo "==> Ensuring ECR repository ${REPO}"
aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
       --image-scanning-configuration scanOnPush=true >/dev/null

echo "==> Ensuring production API key at /rsg-ai/prod/api-key"
if ! aws ssm get-parameter --name /rsg-ai/prod/api-key --region "$REGION" >/dev/null 2>&1; then
  aws ssm put-parameter --name /rsg-ai/prod/api-key --type SecureString \
    --value "$(openssl rand -hex 32)" --region "$REGION" >/dev/null
  echo "    generated a new key. Read it for Vercel with:"
  echo "    aws ssm get-parameter --name /rsg-ai/prod/api-key --with-decryption --region ${REGION} --query Parameter.Value --output text"
fi

echo "==> Building image ${IMAGE} (linux/amd64)"
docker build --platform linux/amd64 -t "$IMAGE" .

echo "==> Pushing to ECR"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR"
docker push "$IMAGE"

if [ -z "${VPC_ID:-}" ]; then
  VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
    --query 'Vpcs[0].VpcId' --output text --region "$REGION")
fi
if [ -z "${SUBNET_IDS:-}" ]; then
  SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" \
    "Name=default-for-az,Values=true" \
    --query 'Subnets[].SubnetId' --output text --region "$REGION" | tr '\t' ',')
fi
echo "==> Deploying stack ${STACK} (vpc ${VPC_ID}, subnets ${SUBNET_IDS})"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file deploy/rsg-ai-service.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ImageUri="$IMAGE" \
    VpcId="$VPC_ID" \
    SubnetIds="$SUBNET_IDS" \
    CertificateArn="${CERT_ARN:-}" \
    RsgAiModel="${RSG_AI_MODEL:-claude-opus-4-8}"

aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].Outputs' --output table
