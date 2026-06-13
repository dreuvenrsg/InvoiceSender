// QBO configuration for the standalone accounting tools (src/).
// Credentials resolve from env vars first, then SSM Parameter Store —
// no hardcoded secrets here. The refresh token is shared with the Lambda
// pipeline via the same SSM parameter, so token rotation stays in sync.
import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

export const REGION = process.env.AWS_REGION || "us-west-1";
export const QBO_ENV = process.env.QBO_ENV === "sandbox" ? "sandbox" : "prod";

const STATIC = {
  prod: {
    host: "https://quickbooks.api.intuit.com/v3/company",
    realmId: "9341453397929901",
  },
  sandbox: {
    host: "https://sandbox-quickbooks.api.intuit.com/v3/company",
    realmId: "9341455274031163",
  },
};

export const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const MINOR_VERSION = 75;
export const HOST = STATIC[QBO_ENV].host;
export const REALM_ID = process.env.QBO_REALM_ID || STATIC[QBO_ENV].realmId;

const ssm = new SSMClient({ region: REGION });
const paramName = (key) => `/qbo-invoice-sender/${QBO_ENV}/${key}`;

async function getParam(key) {
  const res = await ssm.send(
    new GetParameterCommand({ Name: paramName(key), WithDecryption: true })
  );
  return res.Parameter.Value;
}

export async function loadClientCredentials() {
  const clientId = process.env.QBO_CLIENT_ID || (await getParam("client-id"));
  const clientSecret = process.env.QBO_CLIENT_SECRET || (await getParam("client-secret"));
  return { clientId, clientSecret };
}

export async function loadRefreshToken() {
  return getParam("refresh-token");
}

export async function saveRefreshToken(token) {
  await ssm.send(
    new PutParameterCommand({
      Name: paramName("refresh-token"),
      Value: token,
      Type: "SecureString",
      Overwrite: true,
    })
  );
}
