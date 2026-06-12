#!/usr/bin/env bash
# One-time provisioning of the tiny RSG AI EC2 host (t4g.nano, us-west-1):
# IAM role (SSM params + ECR pull + Session Manager), security group (80/443),
# Elastic IP, Amazon Linux 2023 arm64 instance bootstrapped via user-data to
# run docker-compose.yml (agent + Caddy auto-HTTPS). No SSH — shell access is
# `aws ssm start-session --target <instance-id>`.
#
#   DOMAIN=rsg-ai.rsgsecurity.com bash deploy/ec2/launch.sh
#
# After launch: create a DNS A record DOMAIN -> Elastic IP. Caddy issues the
# Let's Encrypt cert automatically once DNS resolves.
set -euo pipefail

REGION=${AWS_REGION:-us-west-1}
NAME=rsg-ai
DOMAIN=${DOMAIN:-rsg-ai.rsgsecurity.com}
INSTANCE_TYPE=${INSTANCE_TYPE:-t4g.nano}
REPO=rsg-ai
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
TAG="arm64-$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${ECR}/${REPO}:${TAG}"

cd "$(dirname "$0")/../.."

EXISTING=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:Name,Values=${NAME}" "Name=instance-state-name,Values=pending,running" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -n "$EXISTING" ]; then
  echo "Instance ${EXISTING} already running. Use deploy/ec2/update.sh to ship new code."
  exit 1
fi

echo "==> Ensuring ECR repository + prod API key"
aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
       --image-scanning-configuration scanOnPush=true >/dev/null
if ! aws ssm get-parameter --name /rsg-ai/prod/api-key --region "$REGION" >/dev/null 2>&1; then
  aws ssm put-parameter --name /rsg-ai/prod/api-key --type SecureString \
    --value "$(openssl rand -hex 32)" --region "$REGION" >/dev/null
  echo "    generated new bearer key at /rsg-ai/prod/api-key"
fi

echo "==> Building + pushing ${IMAGE}"
docker build --platform linux/arm64 -t "$IMAGE" .
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR"
docker push "$IMAGE"

echo "==> IAM role + instance profile"
if ! aws iam get-role --role-name rsg-ai-ec2 >/dev/null 2>&1; then
  aws iam create-role --role-name rsg-ai-ec2 --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]
  }' >/dev/null
  aws iam attach-role-policy --role-name rsg-ai-ec2 \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  aws iam attach-role-policy --role-name rsg-ai-ec2 \
    --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
  aws iam put-role-policy --role-name rsg-ai-ec2 --policy-name rsg-ai-runtime \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {\"Effect\": \"Allow\", \"Action\": \"ssm:GetParameter\", \"Resource\": [
          \"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/rsg-ai/prod/*\",
          \"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/qbo-invoice-sender/*\"
        ]},
        {\"Effect\": \"Allow\", \"Action\": \"ssm:PutParameter\", \"Resource\":
          \"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/qbo-invoice-sender/prod/refresh-token\"}
      ]
    }"
  aws iam create-instance-profile --instance-profile-name rsg-ai-ec2 >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name rsg-ai-ec2 --role-name rsg-ai-ec2
  echo "    created role rsg-ai-ec2 (waiting for propagation)"; sleep 12
fi

echo "==> Security group (80/443 only; shell via SSM Session Manager)"
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")
SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=${NAME}-ec2" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group --region "$REGION" --group-name "${NAME}-ec2" \
    --description "RSG AI agent host (Caddy HTTPS)" --vpc-id "$VPC_ID" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions \
      'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
      'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null
fi

echo "==> User data"
USERDATA=$(mktemp)
cat > "$USERDATA" <<EOF
#!/bin/bash
exec > /var/log/rsg-ai-init.log 2>&1
set -eux
dnf install -y docker
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
mkdir -p /opt/rsg-ai
echo "${IMAGE}" > /opt/rsg-ai/image
echo "${DOMAIN}" > /opt/rsg-ai/domain
echo "$(base64 < deploy/ec2/docker-compose.yml)" | base64 -d > /opt/rsg-ai/docker-compose.yml
echo "$(base64 < deploy/ec2/Caddyfile)" | base64 -d > /opt/rsg-ai/Caddyfile
echo "$(base64 < deploy/ec2/run.sh)" | base64 -d > /opt/rsg-ai/run.sh
chmod +x /opt/rsg-ai/run.sh
/opt/rsg-ai/run.sh
EOF

echo "==> Launching ${INSTANCE_TYPE}"
AMI=$(aws ssm get-parameter --region "$REGION" \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --query Parameter.Value --output text)
SUBNET=$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=${VPC_ID}" "Name=default-for-az,Values=true" \
  --query 'Subnets[0].SubnetId' --output text)
INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
  --iam-instance-profile Name=rsg-ai-ec2 \
  --security-group-ids "$SG_ID" --subnet-id "$SUBNET" \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=12,VolumeType=gp3}' \
  --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=2' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME}}]" \
  --user-data "file://${USERDATA}" \
  --query 'Instances[0].InstanceId' --output text)
rm -f "$USERDATA"
echo "    instance: ${INSTANCE_ID}"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

echo "==> Elastic IP"
ALLOC=$(aws ec2 allocate-address --domain vpc --region "$REGION" \
  --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${NAME}}]" \
  --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC" --region "$REGION" >/dev/null
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --region "$REGION" \
  --query 'Addresses[0].PublicIp' --output text)

cat <<DONE

============================================================
RSG AI host launched.
  Instance:   ${INSTANCE_ID}  (${INSTANCE_TYPE}, ${REGION})
  Elastic IP: ${EIP}
  Image:      ${IMAGE}

Next steps:
  1. Create DNS A record:  ${DOMAIN} -> ${EIP}
     (Caddy gets the Let's Encrypt cert automatically once it resolves.)
  2. Vercel env:
       RSG_AI_URL=https://${DOMAIN}
       RSG_AI_API_KEY=\$(aws ssm get-parameter --name /rsg-ai/prod/api-key \\
         --with-decryption --region ${REGION} --query Parameter.Value --output text)
  3. Ship new code anytime with: bash deploy/ec2/update.sh

Shell access (no SSH): aws ssm start-session --target ${INSTANCE_ID} --region ${REGION}
============================================================
DONE
